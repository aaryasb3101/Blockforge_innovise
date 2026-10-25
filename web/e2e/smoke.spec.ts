import { test, expect } from '@playwright/test';

test.describe('TrustMesh E2E Smoke Tests - Mandatory Scenarios', () => {
  test('Scenario 1: Happy Path - Valid Credential Verification', async ({ page }) => {
    await page.goto('/verifier?sample=valid');
    await expect(page.getByText('Blockchain Verdict')).toBeVisible();
    await expect(page.getByText('VALID')).toBeVisible();
    await expect(page.getByText('Trust Score')).toBeVisible();
  });

  test('Scenario 2: Tamper CGPA - Forensics Tamper Detection (Rule 5)', async ({ page }) => {
    await page.goto('/verifier?sample=tampered');
    await expect(page.getByText('INVALID')).toBeVisible();
    await expect(page.getByText('R5')).toBeVisible();
    await expect(page.getByText('Forensics Decomposition Panel')).toBeVisible();
    await expect(page.getByText('Leaf Mismatch')).toBeVisible();
  });

  test('Scenario 3: Rogue Issuer - Unaccredited Institution Rejection (Rule 2)', async ({ page }) => {
    await page.goto('/verifier?sample=rogue');
    await expect(page.getByText('INVALID')).toBeVisible();
    await expect(page.getByText('R2')).toBeVisible();
  });

  test('Scenario 4: Revocation - Expelled Student Rejection (Rule 6)', async ({ page }) => {
    await page.goto('/verifier?sample=revoked');
    await expect(page.getByText('INVALID')).toBeVisible();
    await expect(page.getByText('R6')).toBeVisible();
  });

  test('Scenario 5: Holder Selective Disclosure & Live Preview', async ({ page }) => {
    await page.goto('/wallet');
    await expect(page.getByText('Holder Privacy Wallet')).toBeVisible();
    await expect(page.getByText('Verifier Will See')).toBeVisible();
    await expect(page.getByText('Hidden in Wallet')).toBeVisible();
    await expect(page.getByText('Present to Decentralized Verifier')).toBeVisible();
  });

  test('Scenario 6: Fraud Playground 18 Attack Vectors', async ({ page }) => {
    await page.goto('/playground');
    await expect(page.getByText('Fraud Simulation Playground')).toBeVisible();
    await expect(page.getByText('Attacks Blocked')).toBeVisible();
    await expect(page.getByText('Run All 18 Attacks')).toBeVisible();
  });
});
