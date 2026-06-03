import { expect, test } from '@playwright/test';

test('login screen loads and primary controls respond without console errors', async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleProblems.push(`${msg.type()}: ${msg.text()}`);
    }
  });
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`));

  await page.addInitScript(() => window.localStorage.setItem('cajachica-theme', 'dark'));
  await page.goto('/');

  await expect(page).toHaveTitle(/Caja Chica/);
  await expect(page.getByRole('heading', { name: 'Caja Chica', includeHidden: true })).toBeAttached();
  await expect(page.getByRole('img', { name: 'Caja Chica' })).toHaveAttribute('src', '/logo-caja-chica-login.png');
  await expect(page.getByText('Solo por invitación.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Entrar con Google/i })).toBeVisible();
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', '/favicon.png');
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icon-192.png');

  await page.getByRole('button', { name: /Cambiar a modo claro/i }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: /Cambiar a modo oscuro/i })).toBeVisible();

  await page.getByRole('button', { name: /Problemas para entrar/i }).click();
  await expect(page.getByText(/mismo email/i)).toBeVisible();
  await expect(page.getByRole('link', { name: /hola@damianjure.com/i })).toBeVisible();

  expect(consoleProblems).toEqual([]);
});
