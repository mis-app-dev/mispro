import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PopUpForm from '../../Molecules/PopUp/PopUpRegis/PopUpForm';
import Pagination from '../../Molecules/Pagination/Pagination';
import StatusConfirmationPopup from '../../Molecules/PopUp/PopUpRegis/StatusConfirmationPopup';
import styles from './Registration.module.css';
import SearchBar from '../../Molecules/SearchBar/SearchBar';
import editPenIcon from '../../../assets/edit_pen_icon.svg';
import ColumnHeader from '../../Molecules/ColumnHeader/ColumnHeader';
import Button from '../../Atoms/Button/Button';
import ResetFilterButton from '../../Atoms/ResetFilterButton/ResetFilterButton';

import {
  getRegistrations,
  getRegistrationOptions,
} from '../../../services/api';

const RegistrationRow = ({ registration, onRowClick, onStatusClick }) => {
  const status = registration.application_status?.toLowerCase() || 'confirmed';
  // eslint-disable-next-line
  const statusStyle =
    status === 'confirmed' ? styles.statusConfirmed : styles.statusCancelled;

  return (
    <div
      className={styles.registrationDataRow}
      onClick={() => onRowClick(registration)}
    >
      <div className={styles.tableCell}>
        {new Date(registration.registration_date).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })}
      </div>
      <div className={styles.tableCell}>{registration.registration_id}</div>
      <div className={styles.tableCell}>{registration.full_name}</div>
      <div className={styles.tableCell}>{registration.grade || 'N/A'}</div>
      <div className={styles.tableCell}>
        {registration.section_name || 'N/A'}
      </div>

      <div className={styles.tableCell}>
        {registration.student_status || 'New'}
      </div>

      <div className={styles.tableCell}>
        <div
          className={styles.tableEditButton}
          onClick={(e) => {
            e.stopPropagation();
            onStatusClick(registration);
          }}
        >
          <span className={styles.editButtonText}>Edit</span>
          <img src={editPenIcon} alt='Edit' className={styles.editButtonIcon} />
        </div>
      </div>
    </div>
  );
};

const Registration = () => {
  const navigate = useNavigate();
  const [registrationData, setRegistrationData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage] = useState(25);
  const [showPopupForm, setShowPopupForm] = useState(false);
  const REFRESH_INTERVAL = 5000;
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const [selectedRegistration, setSelectedRegistration] = useState(null);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [sorts, setSorts] = useState([]);
  const [filterOptions, setFilterOptions] = useState({
    sections: [],
    classes: [],
    applicationStatus: [
      { id: 'Confirmed', name: 'Confirmed' },
      { id: 'Cancelled', name: 'Cancelled' },
    ],
  });
  const fetchControllerRef = useRef(null);

  const fetchRegistrations = useCallback(
    async (filters = {}, page = 1, sorts = [], options = {}) => {
      const { isBackgroundRefresh = false } = options;

      if (!isBackgroundRefresh) setLoading(true);

      const controller = new AbortController();
      const signal = controller.signal;

      fetchControllerRef.current?.abort();
      fetchControllerRef.current = controller;

      let currentSearch = search;
      const allParams = {
        ...filters,
        ...(currentSearch ? { search: currentSearch } : {}),
        sort: sorts.length > 0 ? sorts : undefined,
        page: page,
        per_page: perPage,
      };
      try {
        const res = await getRegistrations(allParams, { signal });
        setRegistrationData(res.data.data || []);
        setTotalPages(res.data.last_page || 1);
        setCurrentPage(res.data.current_page || 1);
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
        console.error('Error fetching registrations:', err);
        setRegistrationData([]);
        setTotalPages(1);
      } finally {
        if (!isBackgroundRefresh) setLoading(false);
      }
    },
    [perPage, search]
  );

  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const opts = await getRegistrationOptions();
        setFilterOptions((prev) => ({
          ...prev,
          sections: opts.sections || [],
          classes: opts.classes || [],
        }));
      } catch (err) {
        console.error('Error fetching registration options:', err);
      }
    };
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search) {
        setCurrentPage(1);
        setFilters((prev) => {
          if (prev.search_name) {
            const newFilters = { ...prev };
            delete newFilters.search_name;
            return newFilters;
          }
          return prev;
        });
        fetchRegistrations(filters, 1, sorts);
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      fetchControllerRef.current?.abort();
    };
  }, [search, filters, sorts, fetchRegistrations]);

  useEffect(() => {
    if (search) return;

    fetchRegistrations(filters, 1, sorts);
  }, [filters, sorts, fetchRegistrations, search]);

  const handleSortChange = (fieldKey) => {
    setSorts((prev) => {
      const current = prev[0]?.field === fieldKey ? prev[0] : null;
      let next;

      if (!current) {
        next = { field: fieldKey, order: 'asc' };
      } else if (current.order === 'asc') {
        next = { field: fieldKey, order: 'desc' };
      } else {
        next = null;
      }

      const newSorts = next ? [next] : [];
      return newSorts;
    });
  };

  const handleFilterChange = (filterKey, selectedValue) => {
    setFilters((prevFilters) => {
      const newFilters = { ...prevFilters };
      if (filterKey === 'date_range' && Array.isArray(selectedValue)) {
        const [startDate, endDate] = selectedValue;
        if (startDate || endDate) {
          newFilters['start_date'] = startDate || undefined;
          newFilters['end_date'] = endDate || undefined;
        } else {
          delete newFilters['start_date'];
          delete newFilters['end_date'];
        }
        delete newFilters[filterKey];
      } else {
        const isArray = Array.isArray(selectedValue);

        if (isArray && selectedValue.length > 0) {
          newFilters[filterKey] = selectedValue;
        } else if (!isArray && selectedValue) {
          newFilters[filterKey] = selectedValue;
        } else {
          delete newFilters[filterKey];
        }

        if (filterKey === 'search_name' && selectedValue) {
          setSearch('');
        }
      }

      return newFilters;
    });
  };

  const handleResetFilters = () => {
    setSearch('');
    setFilters({});
    setSorts([]);
  };

  const getSortOrder = (fieldKey) => {
    return sorts.find((s) => s.field === fieldKey)?.order;
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      fetchRegistrations(filters, newPage, sorts);
    }
  };

  useEffect(() => {
    fetchRegistrations(filters, 1, sorts);
    // eslint-disable-next-line
  }, [fetchRegistrations]);

  useEffect(() => {
    const refreshData = () => {
      const currentFilters = {
        ...filters,
        search: search || filters.search || undefined,
      };
      fetchRegistrations(currentFilters, currentPage, sorts, {
        isBackgroundRefresh: true,
      });
    };
    const intervalId = setInterval(refreshData, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [search, currentPage, fetchRegistrations, filters, sorts]);

  const handleNewForm = () => setShowPopupForm(true);
  const handleClosePopup = () => setShowPopupForm(false);

  const handleCreateForm = (formData) => {
    navigate('/Registration-form', {
      state: { ...formData, fromPopup: true },
    });
    setShowPopupForm(false);
  };

  const handleRowClick = (row) => {
    const applicationId = row.application_id || null;
    const version = row.version_id ?? null;
    navigate('/print', {
      state: { applicationId, version },
    });
  };

  const handleStatusClick = (row) => {
    setSelectedRegistration(row);
    setShowStatusPopup(true);
  };

  const handleCloseStatusPopup = () => {
    setShowStatusPopup(false);
    setSelectedRegistration(null);
  };

  const handleUpdateStatus = (id, newStatus) => {
    setRegistrationData((prevData) =>
      prevData.map((reg) => {
        if (reg.registration_id === id) {
          return {
            ...reg,
            application_status: newStatus, 
            application_form: {
              ...(reg.application_form || {}),
              status: newStatus,
            },
          };
        }
        return reg;
      })
    );

    fetchRegistrations(
      { ...filters, search: search || undefined },
      currentPage,
      sorts
    );
  };

  const handleCanceledRegistration = () => {
    navigate('/canceled-registration');
  };

  return (
    <div className={styles.registrationContainer}>
      <div className={styles.frameParent}>
        <div>
          <div className={styles.title}>Registration</div>

          <div className={styles.searchAndFilterContainer}>
            <SearchBar
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='Find name or student id'
            />
            <ResetFilterButton onClick={handleResetFilters} />
          </div>
        </div>

        <div className={styles.rightHeaderSection}>
          <div className={styles.actionButtonsContainer}>
            <Button onClick={handleCanceledRegistration} variant='outline'>
              Canceled Registration
            </Button>
            <Button onClick={handleNewForm} variant='solid'>
              New Form
            </Button>
          </div>
        </div>
      </div>

      <div className={styles.tableContainer}>
        <div className={styles.tableHeaderGrid}>
          <ColumnHeader
            title='Registration Date'
            hasSort={true}
            fieldKey='registration_date'
            sortOrder={getSortOrder('registration_date')}
            onSort={handleSortChange}
            hasFilter={true}
            filterType='date-range'
            filterKey='date_range'
            onFilterChange={handleFilterChange}
            currentFilterValue={[filters.start_date, filters.end_date]}
          />
          <ColumnHeader
            title='Registration ID'
            hasSort={true}
            fieldKey='registration_id'
            sortOrder={getSortOrder('registration_id')}
            onSort={handleSortChange}
            hasFilter={true}
            filterType='search'
            filterKey='search_id'
            onFilterChange={handleFilterChange}
            currentFilterValue={filters.search_id}
          />
          <ColumnHeader
            title='Student Name'
            hasSort={true}
            fieldKey='full_name'
            sortOrder={getSortOrder('full_name')}
            onSort={handleSortChange}
            hasFilter={true}
            filterType='search'
            filterKey='search_name'
            onFilterChange={handleFilterChange}
            currentFilterValue={filters.search_name}
          />
          <ColumnHeader
            title='Grade'
            hasSort={true}
            fieldKey='grade'
            sortOrder={getSortOrder('grade')}
            onSort={handleSortChange}
            hasFilter={true}
            filterKey='grade'
            onFilterChange={handleFilterChange}
            filterOptions={filterOptions.classes}
            valueKey='grade'
            labelKey='grade'
            currentFilterValue={filters.grade}
          />
          <ColumnHeader
            title='Section'
            hasSort={true}
            fieldKey='section'
            sortOrder={getSortOrder('section')}
            onSort={handleSortChange}
            hasFilter={true}
            filterKey='section'
            onFilterChange={handleFilterChange}
            filterOptions={filterOptions.sections}
            valueKey='name'
            labelKey='name'
            currentFilterValue={filters.section}
          />

          <ColumnHeader title='Type' hasSort={true} hasFilter={true} />

          <ColumnHeader
            title=''
            hasSort={false}
            hasFilter={false}
            fieldKey='application_status'
          />
        </div>

        <div className={styles.tableBody}>
          {loading ? (
            <div className={styles.messageCell}>Loading...</div>
          ) : registrationData.length > 0 ? (
            registrationData.map((row, idx) => (
              <RegistrationRow
                key={idx}
                registration={row}
                onRowClick={handleRowClick}
                onStatusClick={handleStatusClick}
              />
            ))
          ) : (
            <div className={styles.messageCell}>No data available</div>
          )}
        </div>
      </div>

      {!loading && totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            marginTop: '20px',
          }}
        >
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {showPopupForm && (
        <PopUpForm
          type='registration'
          onClose={handleClosePopup}
          onCreate={handleCreateForm}
        />
      )}

      {showStatusPopup && selectedRegistration && (
        <StatusConfirmationPopup
          registration={selectedRegistration}
          onClose={handleCloseStatusPopup}
          onUpdateStatus={handleUpdateStatus}
        />
      )}
    </div>
  );
};

export default Registration;
