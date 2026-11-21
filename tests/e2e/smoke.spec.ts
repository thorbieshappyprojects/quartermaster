import { expect, test } from '@playwright/test';

test('browse, flip a card, play a full duel and a flashcard session', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  // M0: an empty deck renders a clear empty state; nothing else to play yet.
  if (await page.getByTestId('empty-deck').isVisible()) {
    await expect(page.getByRole('heading', { name: 'The deck is empty' })).toBeVisible();
    expect(errors).toEqual([]);
    return;
  }
  await expect(page.getByRole('heading', { name: 'Cards' })).toBeVisible();

  // Card browser → five-face card
  const tiles = page.getByTestId('card-grid').locator('a.tile:not(.cat)');
  expect(await tiles.count()).toBeGreaterThan(1);
  await tiles.first().click();
  const card = page.getByTestId('system-card');
  await expect(card).toBeVisible();
  for (const face of ['Specs', 'Service', 'Business', 'Sources', 'Identity']) {
    await card.getByRole('button', { name: face, exact: true }).click();
    await expect(card.getByRole('button', { name: face, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }

  // Full duel until one side wins
  await page.goto('/#/duel');
  await page.getByTestId('duel-start').click();
  for (let i = 0; i < 200; i++) {
    if (await page.getByTestId('duel-over').isVisible()) break;
    const computer = page.getByTestId('duel-computer');
    const next = page.getByTestId('duel-next');
    if (await next.isVisible()) await next.click();
    else if (await computer.isVisible()) await computer.click();
    else await page.getByTestId('pick').first().click();
  }
  await expect(page.getByTestId('duel-over')).toBeVisible();

  // Flashcard session to the end
  await page.goto('/#/learn');
  await page.getByTestId('learn-start').click();
  for (let i = 0; i < 25; i++) {
    if (await page.getByTestId('learn-done').isVisible()) break;
    await page.getByTestId('option').first().click();
    await page.getByTestId('grade').click();
  }
  await expect(page.getByTestId('learn-done')).toBeVisible();

  // Progress persisted
  await page.goto('/#/settings');
  await expect(page.getByText(/Duels: 1 played/)).toBeVisible();
  expect(errors).toEqual([]);
});
