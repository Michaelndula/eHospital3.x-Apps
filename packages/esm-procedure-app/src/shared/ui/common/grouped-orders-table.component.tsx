import {
  DataTable,
  Search,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableExpandedRow,
  TableExpandHeader,
  TableExpandRow,
  TableHead,
  TableHeader,
  TableRow,
} from '@carbon/react';
import { usePagination } from '@openmrs/esm-framework';
import { CardHeader } from '@openmrs/esm-patient-common-lib';
import upperCase from 'lodash-es/upperCase';
import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import EmptyState from '../../../empty-state/empty-state-component';
import { useSearchGroupedResults } from '../../../hooks/useSearchGroupedResults';
import TransitionLatestQueueEntryButton from '../../../procedures-ordered/transition-patient-new-queue/transition-latest-queue-entry-button.component';
import styles from './grouped-orders-table.scss';
import { type GroupedOrdersTableProps } from './grouped-procedure-types';
import ListOrderDetails from './list-order-details.component';
import { OrdersDateRangePicker } from './orders-date-range-picker';
import { Button } from '@carbon/react';
import PaymentStatusModal from './modal/payment-modal.component';

const GroupedOrdersTable: React.FC<GroupedOrdersTableProps> = (props) => {
  const workListEntries = props.orders;
  const { t } = useTranslation();
  const [currentPageSize] = useState<number>(10);
  const [searchString, setSearchString] = useState<string>('');
  const [selectedOrdersForModal, setSelectedOrdersForModal] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);

  const handleCheckPayment = useCallback((orders: any[]) => {
    setSelectedOrdersForModal(orders);
    setModalOpen(true);
  }, []);

  const groupedOrdersByPatient = useMemo(() => groupOrdersById(workListEntries), [workListEntries]);

  function groupOrdersById(orders) {
    if (orders && orders.length > 0) {
      const grouped = orders.reduce((acc, item) => {
        if (!acc[item.patient.uuid]) {
          acc[item.patient.uuid] = [];
        }
        acc[item.patient.uuid].push(item);
        return acc;
      }, {});
      return Object.keys(grouped).map((patientId) => ({
        patientId: patientId,
        orders: grouped[patientId],
      }));
    } else {
      return [];
    }
  }

  const searchResults = useSearchGroupedResults(groupedOrdersByPatient, searchString);
  const { goTo, results: paginatedResults, currentPage } = usePagination(searchResults, currentPageSize);

  const rowData = useMemo(() => {
    return paginatedResults.map((patient) => ({
      id: patient.patientId,
      patientName: upperCase(patient.orders[0].patient?.person?.display),
      patientAge: patient?.orders[0]?.patient?.person?.age,
      patientGender:
        patient?.orders[0]?.patient?.person?.gender === 'M'
          ? t('male', 'Male')
          : patient?.orders[0]?.patient?.person?.gender === 'F'
          ? t('female', 'Female')
          : patient?.orders[0]?.patient?.person?.gender,
      patientUuid: patient?.orders[0]?.patient?.person?.uuid,
      orders: patient.orders,
      totalOrders: patient.orders?.length,
      paymentStatus: (
        <Button
          onClick={() => handleCheckPayment(patient.orders)}
          className={styles.viewChartButton}
          kind="ghost"
          size="sm">
          {t('checkPayment', 'Check Payment Status')}
        </Button>
      ),
      fulfillerStatus: patient.orders[0].fulfillerStatus,
      action:
        patient.orders[0].fulfillerStatus === 'COMPLETED' ? (
          <TransitionLatestQueueEntryButton patientUuid={patient.patientId} />
        ) : null,
    }));
  }, [paginatedResults, t, handleCheckPayment]);


  const tableColumns = useMemo(() => {
    const baseColumns = [
      { key: 'patientName', header: t('patientName', 'Patient Name') },
      { key: 'patientAge', header: t('age', 'Age') },
      { key: 'patientGender', header: t('sex', 'Sex') },
      { key: 'totalOrders', header: t('totalOrders', 'Total Orders') },
      { key: 'paymentStatus', header: t('paymentStatus', 'Payment Status') },
    ];

    const showActionColumn = workListEntries.some((order) => order.fulfillerStatus === 'COMPLETED');

    return showActionColumn ? [...baseColumns, { key: 'action', header: t('action', 'Action') }] : baseColumns;
  }, [workListEntries, t]);

  return (
    <>
      <div className={styles.widgetCard}>
        <CardHeader title={props?.title}>
          <div className={styles.elementContainer}>
            <OrdersDateRangePicker />
            <Search
              expanded
              persistent={true}
              onChange={(event) => setSearchString(event.target.value)}
              placeholder={t('searchByPatientName', 'Search by patient name')}
              size="md"
            />
          </div>
        </CardHeader>
      </div>

      <DataTable size="md" useZebraStyle rows={rowData} headers={tableColumns}>
        {({
          rows,
          headers,
          getHeaderProps,
          getRowProps,
          getExpandedRowProps,
          getTableProps,
          getTableContainerProps,
        }) => (
          <TableContainer className={styles.dataTable} {...getTableContainerProps()}>
            {rows.length <= 0 && (
              <EmptyState subTitle={t('NoOrdersFound', 'There are no orders to display for this patient')} />
            )}
            {rows.length > 0 && (
              <Table {...getTableProps()} aria-label="sample table">
                <TableHead>
                  <TableRow>
                    <TableExpandHeader aria-label="expand row" />
                    {headers.map((header, i) => (
                      <TableHeader
                        key={i}
                        {...getHeaderProps({
                          header,
                        })}>
                        {header.header}
                      </TableHeader>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <React.Fragment key={row.id}>
                      <TableExpandRow
                        {...getRowProps({
                          row,
                        })}>
                        {row.cells.map((cell) => (
                          <TableCell key={cell.id}>{cell.value}</TableCell>
                        ))}
                      </TableExpandRow>
                      <TableExpandedRow
                        colSpan={headers.length + 1}
                        className="demo-expanded-td"
                        {...getExpandedRowProps({
                          row,
                        })}>
                        <ListOrderDetails
                          actions={props.actions}
                          groupedOrders={groupedOrdersByPatient.find((item) => item.patientId === row.id)}
                          showActions={props.showActions}
                          showOrderType={props.showOrderType}
                          showStartButton={props.showStartButton}
                          showStatus={props.showStatus}
                        />
                      </TableExpandedRow>
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            )}
          </TableContainer>
        )}
      </DataTable>

      <PaymentStatusModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        orders={selectedOrdersForModal}
      />
    </>
  );
};

export default GroupedOrdersTable;