export type CreateCrmContactInput = {
  name: string;
  email: string;
  phone?: string;
};

export interface CrmProvider {
  searchContact(query: string): Promise<unknown>;
  createContact(input: CreateCrmContactInput): Promise<unknown>;
  createLead(input: Record<string, unknown>): Promise<unknown>;
  createTask(input: Record<string, unknown>): Promise<unknown>;
  addNote(input: Record<string, unknown>): Promise<unknown>;
}