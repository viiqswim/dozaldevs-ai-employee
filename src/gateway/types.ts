export interface InngestLike {
  send(event: {
    name: string;
    data: Record<string, unknown>;
    id?: string;
  }): Promise<{ ids: string[] }>;
}
