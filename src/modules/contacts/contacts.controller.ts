import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactHealthQueryDto } from './dto/list-contact-health-query.dto';
import { BulkCreateContactsDto } from './dto/bulk-create-contacts.dto';
import { CONTACT_IMPORT_UPLOAD_OPTIONS } from './contact-import-upload.config';
import { ContactCrmLinksService } from './contact-crm-links.service';
import { ContactWorkspaceService } from './contact-workspace.service';
import { GetContactWorkspaceQueryDto } from './dto/get-contact-workspace-query.dto';
import { ContactActivityService } from './contact-activity.service';
import { ListContactActivityQueryDto } from './dto/list-contact-activity-query.dto';
import { ContactNotesService } from './contact-notes.service';
import { ContactFilesService } from './contact-files.service';
import { CreateContactNoteDto } from './dto/create-contact-note.dto';
import { UpdateContactNoteDto } from './dto/update-contact-note.dto';
import { ListContactContentQueryDto } from './dto/list-contact-content-query.dto';
import { ContactFileDownloadQueryDto } from './dto/contact-file-download-query.dto';
import {
  CUSTOMER_FILE_UPLOAD_OPTIONS,
  MAX_CUSTOMER_FILES_PER_UPLOAD,
} from './contact-file-upload.config';
import { TemporaryUploadCleanupInterceptor } from '../messages/temporary-upload-cleanup.interceptor';

@ApiTags('Customer Contacts')
@ApiBearerAuth()
@Controller('contacts')
@UseGuards(OrganizationGuard, RolesGuard)
@Roles(UserRole.OWNER, UserRole.ADMIN)
export class ContactsController {
  constructor(
    private readonly contacts: ContactsService,
    private readonly crmLinks: ContactCrmLinksService,
    private readonly workspace: ContactWorkspaceService,
    private readonly activity: ContactActivityService,
    private readonly notes: ContactNotesService,
    private readonly files: ContactFilesService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a customer contact without platform login' })
  create(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: CreateContactDto,
  ) {
    return this.contacts.create(organization.id, user.id, input);
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Create multiple customer contacts in one request',
    description:
      'Creates valid unique contacts and returns an ordered result for every input row. Duplicate email/phone rows are safely skipped.',
  })
  bulkCreate(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() input: BulkCreateContactsDto,
  ) {
    return this.contacts.bulkCreate(organization.id, user.id, input);
  }

  @Post('bulk/import')
  @UseInterceptors(FileInterceptor('file', CONTACT_IMPORT_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'UTF-8 CSV, maximum 2 MB and 200 contacts. Columns: name, email, phone, company, job_title, avatar_url, location, website, linkedin_url, lead_status, tags, notes. Separate tags with |.',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Import multiple customer contacts from CSV' })
  bulkImport(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.contacts.bulkCreateFromCsv(organization.id, user.id, file);
  }

  @Get()
  @ApiOperation({ summary: 'List organization customer contacts' })
  list(
    @CurrentOrg() organization: RequestOrganization,
    @Query() query: ListContactsQueryDto,
  ) {
    return this.contacts.list(organization.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a customer contact' })
  get(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.contacts.get(organization.id, id);
  }

  @Get(':id/health')
  @ApiOperation({ summary: 'List persisted AI customer-health snapshots' })
  healthHistory(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Query() query: ListContactHealthQueryDto,
  ) {
    return this.contacts.healthHistory(organization.id, id, query);
  }

  @Get(':id/workspace')
  @ApiOperation({
    summary: 'Get an aggregated customer workspace view',
    description:
      'Returns a bounded, organization-scoped first-paint view containing the customer profile, action capabilities and endpoint contract, CRM links, grounded commercial metrics, open tasks, upcoming meetings, recent linked calls, notes, files, and persisted insights. Unsupported insight fields remain explicitly unavailable.',
  })
  getWorkspace(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Query() query: GetContactWorkspaceQueryDto,
  ) {
    return this.workspace.get(organization.id, id, query, user.role);
  }

  @Get(':id/activity')
  @ApiOperation({
    summary: 'List a unified customer activity timeline',
    description:
      'Returns explicitly linked tasks, meetings, calls, sent emails, CRM changes, customer-profile changes, and persisted AI health insights using stable cursor pagination.',
  })
  listActivity(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Query() query: ListContactActivityQueryDto,
  ) {
    return this.activity.list(organization.id, id, query);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a customer' })
  createNote(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: CreateContactNoteDto,
  ) {
    return this.notes.create(organization.id, user.id, id, input);
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'List customer notes' })
  listNotes(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Query() query: ListContactContentQueryDto,
  ) {
    return this.notes.list(organization.id, id, query);
  }

  @Patch(':id/notes/:noteId')
  @ApiOperation({ summary: 'Update a customer note with revision protection' })
  updateNote(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Body() input: UpdateContactNoteDto,
  ) {
    return this.notes.update(organization.id, user.id, id, noteId, input);
  }

  @Delete(':id/notes/:noteId')
  @ApiOperation({ summary: 'Delete a customer note' })
  deleteNote(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    return this.notes.remove(organization.id, user.id, id, noteId);
  }

  @Post(':id/files')
  @UseInterceptors(
    TemporaryUploadCleanupInterceptor,
    FilesInterceptor(
      'files',
      MAX_CUSTOMER_FILES_PER_UPLOAD,
      CUSTOMER_FILE_UPLOAD_OPTIONS,
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: MAX_CUSTOMER_FILES_PER_UPLOAD,
          items: { type: 'string', format: 'binary' },
          description:
            'Private images, PDFs, text, CSV, Word, Excel, or PowerPoint files; maximum 20 MB each.',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload private files for a customer' })
  uploadFiles(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ) {
    return this.files.upload(organization.id, user.id, id, files);
  }

  @Get(':id/files')
  @ApiOperation({ summary: 'List customer files' })
  listFiles(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Query() query: ListContactContentQueryDto,
  ) {
    return this.files.list(organization.id, id, query);
  }

  @Get(':id/files/:fileId/download')
  @ApiOperation({ summary: 'Get a short-lived private customer-file URL' })
  downloadFile(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
    @Query() query: ContactFileDownloadQueryDto,
  ) {
    return this.files.download(organization.id, id, fileId, query.disposition);
  }

  @Delete(':id/files/:fileId')
  @ApiOperation({ summary: 'Delete a private customer file' })
  deleteFile(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('fileId') fileId: string,
  ) {
    return this.files.remove(organization.id, user.id, id, fileId);
  }

  @Put(':id/crm-links/:crmRecordId')
  @ApiOperation({
    summary: 'Link a synchronized CRM record to a customer contact',
    description:
      'Creates an idempotent organization-scoped link. Provider identity is derived from the authoritative local CRM record and is never trusted from client input.',
  })
  linkCrmRecord(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('crmRecordId') crmRecordId: string,
  ) {
    return this.crmLinks.link(organization.id, user.id, id, crmRecordId);
  }

  @Get(':id/crm-links')
  @ApiOperation({ summary: 'List CRM records linked to a customer contact' })
  listCrmLinks(
    @CurrentOrg() organization: RequestOrganization,
    @Param('id') id: string,
  ) {
    return this.crmLinks.list(organization.id, id);
  }

  @Delete(':id/crm-links/:crmRecordId')
  @ApiOperation({ summary: 'Unlink a CRM record from a customer contact' })
  unlinkCrmRecord(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Param('crmRecordId') crmRecordId: string,
  ) {
    return this.crmLinks.unlink(organization.id, user.id, id, crmRecordId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a customer contact' })
  update(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
    @Body() input: UpdateContactDto,
  ) {
    return this.contacts.update(organization.id, user.id, id, input);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Archive a customer contact' })
  archive(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Param('id') id: string,
  ) {
    return this.contacts.archive(organization.id, user.id, id);
  }
}
