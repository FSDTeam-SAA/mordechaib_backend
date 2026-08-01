import { Injectable } from '@nestjs/common';
import {
  CreateCrmContactInput,
  CrmProvider,
} from '../../../common/types/crm-provider.interface';

@Injectable()
export class SalesforceProvider implements CrmProvider {
  searchContact(query: string) {
    return Promise.resolve({ provider: 'salesforce', query, contacts: [] });
  }
  createContact(input: CreateCrmContactInput) {
    return Promise.resolve({
      provider: 'salesforce',
      action: 'createContact',
      input,
    });
  }
  createLead(input: Record<string, unknown>) {
    return Promise.resolve({
      provider: 'salesforce',
      action: 'createLead',
      input,
    });
  }
  createTask(input: Record<string, unknown>) {
    return Promise.resolve({
      provider: 'salesforce',
      action: 'createTask',
      input,
    });
  }
  addNote(input: Record<string, unknown>) {
    return Promise.resolve({
      provider: 'salesforce',
      action: 'addNote',
      input,
    });
  }
}
