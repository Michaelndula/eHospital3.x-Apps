import React, {useCallback, useState} from 'react';
import {Button, ButtonSet, Form, Row} from '@carbon/react';
import {useTranslation} from 'react-i18next';
import {
  type ConfigObject,
  type Visit,
  ExtensionSlot,
  showSnackbar,
  useConfig,
  useLayoutType,
} from '@openmrs/esm-framework';
import { addQueueEntry } from '../../active-visits/active-visits-table.resource';
import styles from './visit-form.scss';
import classNames from 'classnames';
import {emitRefetchQueuesEvent} from "../../helpers/http-events";

interface ExistingVisitFormProps {
  closePanel: () => void;
  visit: Visit;
}

const ExistingVisitForm: React.FC<ExistingVisitFormProps> = ({ visit, closePanel }) => {
  const { t } = useTranslation();
  const isTablet = useLayoutType() === 'tablet';
  const [isSubmitting, setIsSubmitting] = useState(false);

  const config = useConfig<ConfigObject>();
  const visitQueueNumberAttributeUuid = config.visitQueueNumberAttributeUuid;

  const handleSubmit = useCallback(
    (event) => {
      event.preventDefault();

      // retrieve values from queue extension
      const queueLocation = event?.target['queueLocation']?.value;
      const serviceUuid = event?.target['service']?.value;
      const priority = event?.target['priority']?.value;
      const status = event?.target['status']?.value;
      const sortWeight = event?.target['sortWeight']?.value;

      setIsSubmitting(true);

      addQueueEntry(
        visit.uuid,
        serviceUuid,
        visit.patient.uuid,
        priority,
        status,
        sortWeight,
        queueLocation,
        visitQueueNumberAttributeUuid,
      ).then(
        ({status, data }) => {
          if (status === 201) {
            showSnackbar({
              kind: 'success',
              isLowContrast: true,
              title: t('addPatientToQueue', 'Add patient to queue'),
              subtitle: t('queueEntryAddedSuccessfully', 'Queue entry added successfully'),
            });
            closePanel();
            setIsSubmitting(false);
            emitRefetchQueuesEvent(data?.uuid)
          }
        },
        (error) => {
          let subtitle = error?.message;
          const err = error?.responseBody?.error?.message;
          if (err && err === '[queue.entry.duplicate.patient]') {
            subtitle = t('patientAlreadyInQueue', 'Patient is already in the queue');
          }
          showSnackbar({
            title: t('queueEntryError', 'Error adding patient to the queue'),
            kind: 'error',
            subtitle,
          });
          setIsSubmitting(false);
        },
      );
    },
    [closePanel, visit, t, visitQueueNumberAttributeUuid],
  );

  return visit ? (
    <>
      {isTablet && (
        <Row className={styles.headerGridRow}>
          <ExtensionSlot
            name="visit-form-header-slot"
            className={styles.dataGridRow}
            state={{ patientUuid: visit.patient.uuid }}
          />
        </Row>
      )}
      <Form className={classNames(styles.form, styles.container)} onSubmit={handleSubmit}>
        <ExtensionSlot name="add-queue-entry-slot" />
        <ButtonSet className={isTablet ? styles.tablet : styles.desktop}>
          <Button className={styles.button} kind="secondary" onClick={closePanel}>
            {t('discard', 'Discard')}
          </Button>
          <Button className={styles.button} disabled={isSubmitting} kind="primary" type="submit">
            {t('addPatientToQueue', 'Add patient to queue')}
          </Button>
        </ButtonSet>
      </Form>
    </>
  ) : null;
};

export default ExistingVisitForm;
