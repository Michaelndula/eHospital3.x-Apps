import React, { useCallback, useEffect, useState } from 'react';
import {
  type DefaultWorkspaceProps,
  OpenmrsDatePicker,
  showSnackbar,
  useConfig,
  useDebounce,
  useSession,
} from '@openmrs/esm-framework';
import {
  Form,
  Stack,
  ComboBox,
  TextArea,
  Layer,
  FormLabel,
  ButtonSet,
  Button,
  Search,
  InlineLoading,
  Tile,
  Tag,
  DatePicker,
  DatePickerInput,
} from '@carbon/react';
import { useTranslation } from 'react-i18next';
import styles from './post-procedure-form.scss';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { savePostProcedure, useConditionsSearch, useProvidersSearch } from './post-procedure.resource';
import { type CodedProvider, type CodedCondition, ProcedurePayload, type Result } from '../../types';
import dayjs from 'dayjs';
import { closeOverlay } from '../../components/overlay/hook';
import { type ConfigObject, StringPath } from '../../config-schema';
import { updateOrder } from '../../procedures-ordered/pick-procedure-order/add-to-worklist-dialog.resource';
import { mutate } from 'swr';

const validationSchema = z.object({
  startDatetime: z.date({
    required_error: 'Start datetime is required',
  }),
  endDatetime: z.date({ required_error: 'End datetime is required', invalid_type_error: 'Please select a valid date' }),
  outcome: z.string({ required_error: 'Outcome is required' }),
  procedureReport: z.string({ required_error: 'Procedure report is required' }),
  participants: z.string().optional(),
  complications: z.string().optional(),
});

type PostProcedureFormSchema = z.infer<typeof validationSchema>;

type PostProcedureFormProps = DefaultWorkspaceProps & {
  patientUuid: string;
  order: Result;
};

const PostProcedureForm: React.FC<PostProcedureFormProps> = ({
  patientUuid,
  order,
  closeWorkspace,
  closeWorkspaceWithSavedChanges,
  promptBeforeClosing,
}) => {
  const { sessionLocation } = useSession();
  const { t } = useTranslation();

  const [providerSearchTerm, setProviderSearchTerm] = useState('');
  const debouncedProviderSearchTerm = useDebounce(providerSearchTerm);
  const { providerSearchResults, isProviderSearching } = useProvidersSearch(debouncedProviderSearchTerm);
  const [selectedProvider, setSelectedProvider] = useState<CodedProvider>(null);
  const handleProviderSearchTermChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    setProviderSearchTerm(event.target.value);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm);
  const { searchResults, isSearching } = useConditionsSearch(debouncedSearchTerm);
  const [selectedCondition, setSelectedCondition] = useState<CodedCondition>(null);

  const handleParticipantSearchInputChange = (event) => {
    const value = event.target.value;
    setProviderSearchTerm(value);
    if (!value) {
      setSelectedProvider(null);
      setShowParticipants(false);
    } else {
      setShowParticipants(true);
    }
  };

  const handleSearchInputChange = (event) => {
    const value = event.target.value;
    setSearchTerm(value);
    if (!value) {
      setSelectedCondition(null);
      setShowItems(false);
    } else {
      setShowItems(true);
    }
  };

  const [showParticipants, setShowParticipants] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState([]);

  const [showItems, setShowItems] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const handleParticipantSelect = useCallback((item: CodedProvider) => {
    setSelectedProvider(item);
  }, []);

  const handleSelect = useCallback((item: CodedCondition) => {
    setSelectedCondition(item);
  }, []);

  const {
    procedureComplicationGroupingConceptUuid,
    procedureComplicationConceptUuid,
    procedureResultEncounterType,
    procedureResultEncounterRole,
  } = useConfig<ConfigObject>();

  const {
    control,
    formState: { errors, isSubmitting, isDirty },
    handleSubmit,
  } = useForm<PostProcedureFormSchema>({
    defaultValues: {},
    resolver: zodResolver(validationSchema),
  });

  const handleProviderChange = useCallback((selectedProvider: CodedProvider) => {
    setSelectedProvider(selectedProvider);
  }, []);

  useEffect(() => {
    if (promptBeforeClosing && isDirty) {
      promptBeforeClosing(() => isDirty);
    }
  }, [promptBeforeClosing, isDirty, closeWorkspace]);

  const onSubmit = async (data: PostProcedureFormSchema) => {
    if (!data.startDatetime || !data.endDatetime) {
      // Handle the error case when dates are invalid or missing
      showSnackbar({
        title: t('error', 'Error'),
        subtitle: t('invalidDates', 'Invalid or missing dates'),
        timeoutInMs: 5000,
        isLowContrast: true,
        kind: 'error',
      });
      return;
    }
    const participants = [];
    selectedParticipants.forEach((p) => {
      const provider = {
        provider: p.uuid,
        encounterRole: procedureResultEncounterRole,
      };
      participants.push(provider);
    });
    const complications = [];
    selectedItems.forEach((p) => {
      const complication = {
        groupMembers: [
          {
            concept: procedureComplicationConceptUuid,
            valueCoded: p.concept.uuid,
          },
        ],
        concept: procedureComplicationGroupingConceptUuid,
      };
      complications.push(complication);
    });

    const reportPayload = {
      patient: patientUuid,
      procedureOrder: order?.uuid,
      concept: order?.concept?.uuid,
      procedureReason: order?.orderReason?.uuid,
      category: order?.orderType?.uuid,
      status: 'COMPLETED',
      outcome: data.outcome,
      location: sessionLocation?.uuid,
      startDatetime: dayjs(data.startDatetime).format('YYYY-MM-DDTHH:mm:ss'),
      endDatetime: dayjs(data.endDatetime).format('YYYY-MM-DDTHH:mm:ss'),
      procedureReport: data.procedureReport,
      encounters: [
        {
          encounterDatetime: new Date(),
          patient: patientUuid,
          encounterType: procedureResultEncounterType,
          encounterProviders: participants,
          obs: complications,
        },
      ],
    };
    try {
      const response = await savePostProcedure(reportPayload);
      if (response.ok) {
        showSnackbar({
          title: t('procedureSaved', 'Procedure saved'),
          subtitle: t('procedureSavedSuccessfully', 'Procedure saved successfully'),
          timeoutInMs: 5000,
          isLowContrast: true,
          kind: 'success',
        });
        mutate((key) => typeof key === 'string' && key.startsWith('/ws/rest/v1/order'), undefined, {
          revalidate: true,
        });
        closeWorkspaceWithSavedChanges();
      }
    } catch (error) {
      console.error(error);
      showSnackbar({
        title: t('error', 'Error'),
        subtitle: t('errorSavingProcedure', 'Error saving procedure'),
        timeoutInMs: 5000,
        isLowContrast: true,
        kind: 'error',
      });
      closeOverlay();
    }
  };

  const onError = (error: any) => {
    console.error(error);
  };

  return (
    <Form onSubmit={handleSubmit(onSubmit, onError)} className={styles.formContainer}>
      <Stack gap={4}>
        <Layer>
          <FormLabel className={styles.formLabel}>{t('date', 'Date')}</FormLabel>
          <Controller
            control={control}
            name="startDatetime"
            render={({ field, fieldState }) => (
              <DatePicker
                datePickerType="single"
                className={styles.formDatePicker}
                onChange={(event) => {
                  field.onChange(event[0]);
                }}
                value={field.value}>
                <DatePickerInput
                  placeholder="mm/dd/yyyy"
                  labelText={t('startDatetime', 'Start Datetime')}
                  id="startDatetime"
                  size="md"
                  invalid={!!errors.startDatetime}
                  invalidText={errors.startDatetime?.message}
                />
              </DatePicker>
            )}
          />
        </Layer>
        <Layer>
          <Controller
            control={control}
            name="endDatetime"
            render={({ field, fieldState }) => (
              <DatePicker
                datePickerType="single"
                className={styles.formDatePicker}
                onChange={(event) => {
                  field.onChange(event[0]);
                }}
                value={field.value}>
                <DatePickerInput
                  placeholder="mm/dd/yyyy"
                  labelText={t('endDatetime', 'End Datetime')}
                  id="endDatetime"
                  size="md"
                  invalid={!!errors.endDatetime}
                  invalidText={errors.endDatetime?.message}
                />
              </DatePicker>
            )}
          />
        </Layer>

        <Layer>
          <FormLabel className={styles.formLabel}>{t('procedureOutcome', 'Procedure outcome')}</FormLabel>
          <Controller
            control={control}
            name="outcome"
            render={({ field: { onChange } }) => (
              <ComboBox
                onChange={({ selectedItem }) => onChange(selectedItem.id)}
                id="outcome"
                items={[
                  { id: 'SUCCESSFUL', text: t('successful', 'Successful') },
                  {
                    id: 'PARTIALLY_SUCCESSFUL',
                    text: t('partiallySuccessful', 'Partially success'),
                  },
                  {
                    id: 'NOT_SUCCESSFUL',
                    text: t('notSuccessfully', 'Not successful'),
                  },
                ]}
                itemToString={(item) => (item ? item.text : '')}
                placeholder={t('selectOutcome', 'Select outcome')}
                invalid={!!errors.outcome}
                invalidText={errors.outcome?.message}
              />
            )}
          />
        </Layer>
        <Layer>
          <FormLabel className={styles.formLabel}>{t('procedureReport', 'Procedure report')}</FormLabel>
          <Controller
            control={control}
            name="procedureReport"
            render={({ field: { onChange } }) => (
              <TextArea
                id="procedureReport"
                rows={4}
                onChange={onChange}
                placeholder={t('procedureReportPlaceholder', 'Enter procedure report')}
                invalid={!!errors.procedureReport}
                invalidText={errors.procedureReport?.message}
              />
            )}
          />
        </Layer>
        <Layer>
          <FormLabel className={styles.formLabel}>{t('participants', 'Participants')}</FormLabel>
          <div>
            {selectedParticipants?.map((item) => (
              <>
                <Tag style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px' }}>{item.display}</span>
                  <svg
                    focusable="false"
                    fill="currentColor"
                    width="16"
                    height="16"
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                    onClick={() => setSelectedParticipants((prevItems) => prevItems.filter((i) => i !== item))}>
                    <path d={StringPath}></path>
                  </svg>
                </Tag>
              </>
            ))}
          </div>
          <div>
            <Search
              autoFocus
              size="md"
              id="participantsSearch"
              placeholder={t('participants', 'Participants')}
              labelText={t('enterParticipant', 'Enter Participant')}
              onChange={handleParticipantSearchInputChange}
              onClear={() => setProviderSearchTerm('')}
            />
            {providerSearchResults?.length === 0 ? (
              <div className={styles.filterEmptyState}>
                <Layer level={0}>
                  <Tile className={styles.filterEmptyStateTile}>
                    <span className={styles.filterEmptyStateContent}>
                      <strong>{debouncedProviderSearchTerm}</strong>
                    </span>
                  </Tile>
                </Layer>
              </div>
            ) : (
              showParticipants && (
                <ul className={styles.participantsList}>
                  {providerSearchResults.map((item) => (
                    <li
                      key={item?.uuid}
                      role="menuitem"
                      tabIndex={0}
                      className={styles.participantService}
                      onClick={() => {
                        handleParticipantSelect(item);
                        setSelectedParticipants((prevItems) => [...prevItems, item]);
                        setShowParticipants(false);
                      }}>
                      {item.display}
                    </li>
                  ))}
                </ul>
              )
            )}
            {isProviderSearching && <InlineLoading description="Loading participants..." />}
          </div>
        </Layer>
        <Layer>
          <FormLabel className={styles.formLabel}>{t('complications', 'Complications')}</FormLabel>
          <div>
            {selectedItems?.map((item) => (
              <>
                <Tag style={{ display: 'inline-flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px' }}>{item.display}</span>
                  <svg
                    focusable="false"
                    fill="currentColor"
                    width="16"
                    height="16"
                    viewBox="0 0 32 32"
                    aria-hidden="true"
                    onClick={() => setSelectedItems((prevItems) => prevItems.filter((i) => i !== item))}>
                    <path d={StringPath}></path>
                  </svg>
                </Tag>
              </>
            ))}
          </div>
          <div>
            <Search
              autoFocus
              size="md"
              id="conditionsSearch"
              placeholder={t('complications', 'complications')}
              labelText={t('enterCondition', 'Enter condition')}
              onChange={handleSearchInputChange}
              onClear={() => setSearchTerm('')}
            />
            {searchResults?.length === 0 ? (
              <div className={styles.filterEmptyState}>
                <Layer level={0}>
                  <Tile className={styles.filterEmptyStateTile}>
                    <span className={styles.filterEmptyStateContent}>
                      <strong>{debouncedSearchTerm}</strong>
                    </span>
                  </Tile>
                </Layer>
              </div>
            ) : (
              showItems && (
                <ul className={styles.complicationsList}>
                  {searchResults.map((item) => (
                    <li
                      key={item?.concept?.uuid}
                      role="menuitem"
                      tabIndex={0}
                      className={styles.complicationService}
                      onClick={() => {
                        handleSelect(item);
                        setSelectedItems((prevItems) => [...prevItems, item]);
                        setShowItems(false);
                      }}>
                      {item.display}
                    </li>
                  ))}
                </ul>
              )
            )}
            {isSearching && <InlineLoading description="Loading complications..." />}
          </div>
        </Layer>
      </Stack>
      <ButtonSet className={styles.buttonSetContainer}>
        <Button onClick={closeWorkspace} size="md" kind="secondary">
          {t('discard', 'Discard')}
        </Button>
        <Button type="submit" size="md" kind="primary">
          {t('saveAndClose', 'Save & Close')}
        </Button>
      </ButtonSet>
    </Form>
  );
};

export default PostProcedureForm;
