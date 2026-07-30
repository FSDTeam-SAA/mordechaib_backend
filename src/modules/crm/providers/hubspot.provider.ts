import { Injectable } from '@nestjs/common';
import {
  CreateCrmContactInput,
  CrmProvider,
} from '../interfaces/crm-provider.interface';

@Injectable()
export class HubSpotProvider implements CrmProvider {
  searchContact(query: string) {
    return Promise.resolve({ provider: 'hubspot', query, contacts: [] });
  }
  createContact(input: CreateCrmContactInput) {
    return Promise.resolve({
      provider: 'hubspot',
      action: 'createContact',
      input,
    });
  }
  createLead(input: Record<string, unknown>) {
    return Promise.resolve({
      provider: 'hubspot',
      action: 'createLead',
      input,
    });
  }
  createTask(input: Record<string, unknown>) {
    return Promise.resolve({
      provider: 'hubspot',
      action: 'createTask',
      input,
    });
  }
  addNote(input: Record<string, unknown>) {
    return Promise.resolve({ provider: 'hubspot', action: 'addNote', input });
  }
}
