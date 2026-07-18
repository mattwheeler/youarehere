import { DatabaseSync } from "node:sqlite";

type SQLiteStatement = ReturnType<DatabaseSync["prepare"]>;

class SQLiteD1Statement {
  private values: unknown[] = [];

  constructor(private readonly statement: SQLiteStatement) {}

  bind(...values: unknown[]): SQLiteD1Statement {
    this.values = values;
    return this;
  }

  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  async first<T = Record<string, unknown>>(): Promise<T | null> {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
}

export class SQLiteD1TestDatabase {
  private readonly database = new DatabaseSync(":memory:");

  prepare(query: string): SQLiteD1Statement {
    return new SQLiteD1Statement(this.database.prepare(query));
  }

  async batch<T>(statements: SQLiteD1Statement[]): Promise<T[]> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results: unknown[] = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results as T[];
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }
}
