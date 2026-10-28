// Preserve failures while allowing the remaining original assertions in a case
// to run. The case still fails if any collected assertion fails.
export function assertionGroup() {
  const failures: unknown[] = [];
  return {
    check(run: () => void): void { try { run(); } catch (error) { failures.push(error); } },
    async checkAsync(run: () => Promise<void>): Promise<void> { try { await run(); } catch (error) { failures.push(error); } },
    finish(): void {
      if (failures.length) throw new AggregateError(failures, failures.map(error => error instanceof Error ? error.message : String(error)).join('\n\n'));
    },
  };
}
