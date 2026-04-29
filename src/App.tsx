import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Trash2, 
  Copy, 
  Check, 
  TrendingDown, 
  TrendingUp, 
  MessageSquareText, 
  History as HistoryIcon,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { api, ExtractedItem, Movimiento, Empresa, Categoria, GeminiResponse } from './services/api';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as any).env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export default function App() {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [history, setHistory] = useState<Movimiento[]>([]);
  const [pendingItem, setPendingItem] = useState<ExtractedItem & { originalText: string } | null>(null);
  const [customCompanies, setCustomCompanies] = useState<Empresa[]>([]);
  const [categories, setCategories] = useState<Categoria[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'warning'} | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [isConfigured, setIsConfigured] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const oldestDate = useRef<string | null>(null);

  const companiesList = [
    'all', 
    ...Array.from(new Set([
      ...customCompanies.map(c => c.nombre),
      ...history.map(item => item.empresa_nombre).filter(Boolean)
    ])) as string[]
  ];

  const stats = history.reduce((acc, item) => {
    if (selectedCompany !== 'all' && item.empresa_nombre !== selectedCompany) return acc;
    const key = `${item.moneda}_${item.tipo}`;
    acc[key] = (acc[key] || 0) + Number(item.monto || 0);
    return acc;
  }, {} as Record<string, number>);

  const filteredHistory = selectedCompany === 'all' 
    ? history 
    : history.filter(item => item.empresa_nombre === selectedCompany);

  const loadData = async (append = false) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    try {
      const url = (import.meta as any).env.VITE_SUPABASE_URL;
      if (!url || url.includes('placeholder')) {
        setIsConfigured(false);
        setIsLoading(false);
        return;
      }

      const limit = 50;
      const [movs, emps, cats] = await Promise.all([
        api.getMovimientos(limit),
        api.getEmpresas(),
        api.getCategorias()
      ]);

      if (append && oldestDate.current) {
        const filtered = movs.filter((m: Movimiento) => m.created_at < oldestDate.current);
        setHistory(prev => [...prev, ...filtered]);
        if (filtered.length < limit) setHasMore(false);
        if (filtered.length > 0) oldestDate.current = filtered[filtered.length - 1].created_at;
      } else {
        setHistory(movs);
        setHasMore(movs.length >= limit);
        if (movs.length > 0) oldestDate.current = movs[movs.length - 1].created_at;
      }

      setCustomCompanies(emps);
      setCategories(cats);
      setIsConfigured(true);
    } catch (err) {
      console.error('Failed to load data', err);
      setIsConfigured(false);
    } finally {
      setIsLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!supabase) return;

    const channel = supabase
      .channel('realtime-movimientos')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'movimientos' },
        (payload) => {
          const newMov = payload.new as Movimiento;
          setHistory(prev => {
            if (prev.some(m => m.id === newMov.id)) return prev;
            return [newMov, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'movimientos' },
        (payload) => {
          setHistory(prev => prev.filter(m => m.id !== payload.old.id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'empresas' },
        (payload) => {
          const newEmp = payload.new as Empresa;
          setCustomCompanies(prev => {
            if (prev.some(e => e.id === newEmp.id)) return prev;
            return [...prev, newEmp];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'categorias' },
        (payload) => {
          const newCat = payload.new as Categoria;
          setCategories(prev => {
            if (prev.some(c => c.id === newCat.id)) return prev;
            return [...prev, newCat];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const showNotification = (message: string, type: 'success' | 'warning' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleProcess = async () => {
    if (!inputText.trim() || isProcessing) return;
    setIsProcessing(true);
    setError(null);

    try {
      const result = await api.extract(inputText, categories);
      
      if ('error' in result) {
        setError(result.error === 'no_data_found' ? 'No se entendió el comando.' : result.error);
      } else {
        switch ((result as GeminiResponse).intent) {
          case 'GESTIONAR_EMPRESA': {
            const r = result as { action: string; companyName: string };
            if (r.action === 'ADD') {
              const exists = customCompanies.some(c => c.nombre.toLowerCase() === r.companyName.toLowerCase());
              if (!exists) {
                const newEmp = await api.addEmpresa(r.companyName);
                setCustomCompanies(prev => [...prev, newEmp]);
                showNotification(`Empresa "${r.companyName}" creada.`);
              } else {
                showNotification(`La empresa "${r.companyName}" ya existe.`, 'warning');
              }
            }
            break;
          }

          case 'ELIMINAR_MOVIMIENTO': {
            const r = result as { target: string };
            if (r.target === 'last') {
              const res = await api.deleteLastMovimiento();
              if (res.id) {
                setHistory(prev => prev.filter(m => m.id !== res.id));
                showNotification('Último movimiento eliminado.');
              }
            }
            break;
          }

          case 'REGISTRAR': {
            const r = result as { items: ExtractedItem[] };
            const saved = await api.saveMovimientos(r.items, inputText);
            setHistory(prev => [...saved, ...prev]);
            showNotification(`${saved.length} transacciones registradas.`);
            break;
          }
          
          default:
            setError('Intención no soportada todavía.');
        }
        setInputText('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar.');
    } finally {
      setIsProcessing(false);
    }
  };

  const deleteItem = async (id: string) => {
    if (window.confirm('¿Borrar este movimiento?')) {
      try {
        await api.deleteMovimiento(id);
        setHistory(prev => prev.filter(i => i.id !== id));
        showNotification('Movimiento eliminado.', 'warning');
      } catch {
        showNotification('Error al eliminar.', 'warning');
      }
    }
  };

  const deleteCompany = async (id: string, name: string) => {
    if (window.confirm(`¿Borrar empresa "${name}"?`)) {
      try {
        await api.deleteEmpresa(id);
        setCustomCompanies(prev => prev.filter(c => c.id !== id));
        if (selectedCompany === name) setSelectedCompany('all');
        showNotification(`Empresa "${name}" eliminada.`, 'warning');
      } catch {
        showNotification('Error: Posible empresa con movimientos.', 'warning');
      }
    }
  };

  const deleteCategory = async (id: string, name: string) => {
    if (window.confirm(`¿Borrar categoría "${name}"?`)) {
      try {
        await api.deleteCategoria(id);
        setCategories(prev => prev.filter(c => c.id !== id));
        showNotification(`Categoría "${name}" eliminada.`, 'warning');
      } catch {
        showNotification('Error: Posible categoría en uso.', 'warning');
      }
    }
  };

  const copyJson = (item: Movimiento) => {
    const { id, original_text, created_at, ...cleanData } = item;
    navigator.clipboard.writeText(JSON.stringify(cleanData, null, 2));
    setCopiedId(item.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearHistory = async () => {
    if (window.confirm('¿Seguro que querés borrar todo el historial?')) {
      try {
        await api.deleteAllMovimientos();
        setHistory([]);
        showNotification('Historial borrado.', 'warning');
      } catch {
        showNotification('Error al borrar historial.', 'warning');
      }
    }
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    await loadData(true);
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {!isConfigured && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>
              <strong>Supabase no configurado:</strong> Los datos no se guardarán permanentemente. 
              Configurá las variables <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>.
            </p>
          </div>
        )}

        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 id="app-title" className="text-3xl font-bold tracking-tight text-neutral-900">
              Extractor Financiero Argento
            </h1>
            <p className="text-neutral-500 mt-1">
              Convertí jerga rioplatense (lucas, palos, gambas) en datos estructurados.
            </p>
          </div>
          
          <div className="flex items-center gap-6">
            {isLoading && <Loader2 className="w-5 h-5 animate-spin text-neutral-400" />}
            <div className="flex items-center gap-2 text-xs font-mono text-neutral-400 bg-neutral-100 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Realtime Active
            </div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1 text-green-600">Ingresos ARS</span>
              <div className="text-2xl font-bold text-neutral-900">
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(stats['ARS_ingreso'] || 0)}
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1 text-red-600">Egresos ARS</span>
              <div className="text-2xl font-bold text-neutral-900">
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(stats['ARS_egreso'] || 0)}
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1 text-green-600">Ingresos USD</span>
              <div className="text-2xl font-bold text-neutral-900">
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(stats['USD_ingreso'] || 0)}
              </div>
            </div>
            <div className="bg-white p-5 rounded-2xl border border-neutral-100 shadow-sm">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest block mb-1 text-red-600">Egresos USD</span>
              <div className="text-2xl font-bold text-neutral-900">
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD' }).format(stats['USD_egreso'] || 0)}
              </div>
            </div>
          </div>

          <div className="lg:col-span-12 space-y-4">
            <AnimatePresence mode="wait">
              {pendingItem ? (
                <motion.div
                  key="pending-selector"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-neutral-900 text-white p-8 rounded-3xl shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-8 opacity-10">
                    <AlertCircle className="w-24 h-24" />
                  </div>
                  
                  <div className="relative z-10 space-y-6">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">Asignar Empresa</span>
                      <h3 className="text-2xl font-bold mt-1">¿A qué empresa cargamos esto?</h3>
                      <p className="text-neutral-400 mt-2 italic">"{pendingItem.originalText}"</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {companiesList.filter(c => c !== 'all').map(company => (
                        <button
                          key={company}
                          onClick={async () => {
                            const saved = await api.saveMovimientos([{ ...pendingItem, empresa: company }], pendingItem.originalText);
                            setHistory(prev => [...saved, ...prev]);
                            setPendingItem(null);
                            showNotification(`Asignado a ${company}`);
                          }}
                          className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-xl transition-colors font-medium border border-white/10"
                        >
                          {company}
                        </button>
                      ))}
                      <button
                        onClick={async () => {
                          const saved = await api.saveMovimientos([{ ...pendingItem, empresa: 'Personal' }], pendingItem.originalText);
                          setHistory(prev => [...saved, ...prev]);
                          setPendingItem(null);
                          showNotification('Asignado a Personal');
                        }}
                        className="bg-white/5 hover:bg-white/10 text-neutral-400 px-5 py-2.5 rounded-xl transition-colors text-sm border border-white/5"
                      >
                        Sin empresa (Personal)
                      </button>
                    </div>

                    <button 
                      onClick={() => setPendingItem(null)}
                      className="text-xs text-neutral-500 hover:text-white transition-colors underline underline-offset-4"
                    >
                      Cancelar registro
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="relative group">
                  <textarea
                    id="message-input"
                    className="w-full min-h-[140px] p-6 bg-white border border-neutral-200 rounded-2xl shadow-sm focus:ring-2 focus:ring-neutral-900 focus:border-transparent outline-none transition-all resize-none text-lg"
                    placeholder="Ej: 'Che, cobré 5 lucas por el laburito del taller' o 'Agregar empresa Casa'"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && handleProcess()}
                  />
                  <div className="absolute bottom-4 right-4 flex items-center gap-3">
                    <span className="text-xs text-neutral-400 hidden sm:block">Ctrl + Enter</span>
                    <button
                      id="process-button"
                      onClick={handleProcess}
                      disabled={!inputText.trim() || isProcessing}
                      className="flex items-center gap-2 bg-neutral-900 text-white px-6 py-2.5 rounded-xl font-medium hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-neutral-200"
                    >
                      {isProcessing ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      {isProcessing ? 'Procesando...' : 'Enviar'}
                    </button>
                  </div>
                </div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100 text-sm"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}
          </div>

          <div className="lg:col-span-12 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 id="history-title" className="text-xl font-semibold flex items-center gap-2">
                <HistoryIcon className="w-5 h-5" />
                Historial de Extracciones
              </h2>
              
              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
                {companiesList.map(company => {
                  const empObj = customCompanies.find(c => c.nombre === company);
                  return (
                    <div key={company} className="relative group">
                      <button
                        onClick={() => setSelectedCompany(company)}
                        className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                          selectedCompany === company 
                            ? 'bg-neutral-900 text-white shadow-md' 
                            : 'bg-white border border-neutral-200 text-neutral-500 hover:border-neutral-400'
                        }`}
                      >
                        {company === 'all' ? 'Todas las Empresas' : company}
                      </button>
                      {empObj && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); deleteCompany(empObj.id, empObj.nombre); }}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-hide border-t border-neutral-100 pt-4">
                <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mr-2">Categorías:</span>
                {categories.map(cat => (
                  <div key={cat.id} className="group relative">
                    <span className="px-3 py-1 bg-neutral-100 text-neutral-600 rounded-full text-xs font-medium">
                      {cat.nombre}
                    </span>
                    <button 
                      onClick={() => deleteCategory(cat.id, cat.nombre)}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {notification && (
                  <motion.div
                    initial={{ opacity: 0, y: 50 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl shadow-xl z-50 text-sm font-medium flex items-center gap-3 ${
                      notification.type === 'success' ? 'bg-neutral-900 text-white' : 'bg-red-500 text-white'
                    }`}
                  >
                    {notification.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {notification.message}
                  </motion.div>
                )}
              </AnimatePresence>

              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-xs text-neutral-400 hover:text-red-500 transition-colors uppercase tracking-wider font-bold"
                >
                  Borrar Todo
                </button>
              )}
            </div>

            {filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-4 border-2 border-dashed border-neutral-200 rounded-3xl text-neutral-400">
                <MessageSquareText className="w-12 h-12 mb-4 opacity-20" />
                <p>{selectedCompany === 'all' ? 'Todavía no hay nada por acá.' : `No hay datos para "${selectedCompany}"`}</p>
                <p className="text-sm">Mandá un mensaje para empezar.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <AnimatePresence mode="popLayout">
                  {filteredHistory.map((item) => (
                    <motion.div
                      key={item.id}
                      layout
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="group bg-white border border-neutral-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                    >
                      <div className={`absolute top-0 right-0 w-32 h-32 -mr-16 -mt-16 rounded-full opacity-[0.03] pointer-events-none ${
                        item.tipo === 'ingreso' ? 'bg-green-500' : 'bg-red-500'
                      }`} />

                      <div className="flex justify-between items-start mb-4">
                        <div className="flex items-center gap-2">
                          <div className={`p-2 rounded-lg ${
                            item.tipo === 'ingreso' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                          }`}>
                            {item.tipo === 'ingreso' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-400 block leading-none mb-1">
                              {item.categoria}
                            </span>
                            <span className="font-semibold text-neutral-900">
                              {item.monto !== null 
                                ? new Intl.NumberFormat('es-AR', { 
                                    style: 'currency', 
                                    currency: item.moneda || 'ARS' 
                                  }).format(item.monto)
                                : 'Monto no especificado'
                              }
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyJson(item)}
                            className="p-2 text-neutral-400 hover:text-neutral-900 transition-colors rounded-lg hover:bg-neutral-50"
                            title="Copiar JSON"
                          >
                            {copiedId === item.id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            className="p-2 text-neutral-400 hover:text-red-600 transition-colors rounded-lg hover:bg-red-50"
                            title="Borrar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-sm text-neutral-600 italic line-clamp-2">
                          "{item.original_text}"
                        </p>
                        
                        <div className="flex flex-wrap gap-2">
                          {item.empresa_nombre && (
                            <span className="text-[11px] font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md">
                              🏢 {item.empresa_nombre}
                            </span>
                          )}
                          <span className="text-[11px] font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded-md">
                            🎯 {item.descripcion}
                          </span>
                        </div>

                        <div className="pt-3 border-t border-neutral-50 flex justify-between items-center">
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {new Date(item.created_at).toLocaleString('es-AR')}
                          </span>
                          <span className={`text-[10px] font-bold uppercase tracking-tight ${
                            item.tipo === 'ingreso' ? 'text-green-500' : 'text-red-500'
                          }`}>
                            {item.tipo}
                          </span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {hasMore && filteredHistory.length > 0 && (
              <div className="flex justify-center pt-4">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-2 bg-white border border-neutral-200 rounded-xl text-sm font-medium text-neutral-600 hover:border-neutral-400 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</span>
                  ) : 'Cargar más'}
                </button>
              </div>
            )}
          </div>
        </main>

        <footer className="pt-12 pb-8 border-t border-neutral-100 text-center">
          <p className="text-xs text-neutral-400">
            Desarrollado para el mercado Argentino. Las conversiones de jerga son aproximadas y se basan en el uso común.
          </p>
        </footer>
      </div>
    </div>
  );
}
