import { supabase } from '../lib/supabase';
import { ExtractedItem } from './gemini';

export interface Empresa {
  id: string;
  nombre: string;
  created_at: string;
}

export interface Movimiento extends ExtractedItem {
  id: string;
  created_at: string;
  original_text: string;
}

export const dbService = {
  // --- Empresas ---
  async getEmpresas() {
    const { data, error } = await supabase
      .from('empresas')
      .select('*')
      .order('nombre', { ascending: true });
    if (error) throw error;
    return data as Empresa[];
  },

  async addEmpresa(nombre: string) {
    const { data, error } = await supabase
      .from('empresas')
      .insert([{ nombre }])
      .select()
      .single();
    if (error) throw error;
    return data as Empresa;
  },

  async deleteEmpresa(id: string) {
    const { error } = await supabase
      .from('empresas')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  // --- Movimientos ---
  async getMovimientos(filters?: { empresa_nombre?: string }) {
    let query = supabase
      .from('movimientos')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (filters?.empresa_nombre && filters.empresa_nombre !== 'all') {
      query = query.eq('empresa_nombre', filters.empresa_nombre);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Movimiento[];
  },

  async addMovimiento(item: ExtractedItem, originalText: string) {
    const { data, error } = await supabase
      .from('movimientos')
      .insert([{
        tipo: item.tipo,
        moneda: item.moneda,
        monto: item.monto,
        categoria: item.categoria,
        empresa_nombre: item.empresa,
        descripcion: item.descripcion,
        original_text: originalText
      }])
      .select()
      .single();
    if (error) throw error;
    return data as Movimiento;
  },

  async deleteMovimiento(id: string) {
    const { error } = await supabase
      .from('movimientos')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  async deleteLastMovimiento() {
    // Get last item
    const { data: last, error: fetchError } = await supabase
      .from('movimientos')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (fetchError) throw fetchError;
    if (last) {
      const { error: delError } = await supabase
        .from('movimientos')
        .delete()
        .eq('id', last.id);
      if (delError) throw delError;
      return last.id;
    }
    return null;
  }
};
