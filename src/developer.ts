export const DEVELOPER_CASH_GRANT = 1_000;

export function grantDeveloperCash(state: { cash: number }): void {
  state.cash += DEVELOPER_CASH_GRANT;
}
