import React, { useState, useEffect, useRef } from 'react';
import {
  searchStudent,
  getStudentLatestApplication,
  getRegistrationOptions,
} from '../../../../../services/api';
import styles from './StudentStatusSection.module.css';

const StudentStatusSection = ({
  onSelectOldStudent,
  onDataChange,
  sharedData,
  errors,
  forceError,
  onClearForm,
}) => {
  const [status, setStatus] = useState('');
  const [statusOptions, setStatusOptions] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [searchResults, setSearchResults] = useState({ new: [], old: [] });
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (sharedData) {
      const opts = sharedData.student_status || [];
      const ordered = ['New', 'Transferee', 'Old'].filter((o) =>
        opts.includes(o)
      );
      setStatusOptions(ordered);
    } else {
      getRegistrationOptions()
        .then((data) => {
          const opts = data.student_status || [];
          const ordered = ['New', 'Transferee', 'Old'].filter((o) =>
            opts.includes(o)
          );
          setStatusOptions(ordered);
        })
        .catch((err) => {
          console.error('Failed to fetch student status options:', err);
        });
    }
  }, [sharedData]);

  const handleStatusChange = (option) => {
    setStatus(option);
    setStudentSearch('');
    setSearchResults({ new: [], old: [] });

    if ((option === 'New' || option === 'Transferee') && onClearForm) {
      onClearForm();
    }

    if (onDataChange) {
      onDataChange({
        student_status: option,
        input_name: '',
        is_selected: false, 
      });
    }
  };

  const handleSearchChange = async (value) => {
    setStudentSearch(value);

    if (onDataChange) {
      onDataChange({
        student_status: 'Old',
        input_name: value, 
        is_selected: false, 
      });
    }

    if (value.length > 2) {
      setIsSearching(true);
      try {
        const results = await searchStudent(value);
        setSearchResults(results);
        setShowDropdown(results.new?.length > 0 || results.old?.length > 0);
      } catch (err) {
        console.error('Error searching student:', err);
        setSearchResults({ new: [], old: [] });
        setShowDropdown(false);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults({ new: [], old: [] });
      setShowDropdown(false);
    }
  };

  const handleSelectStudent = async (student) => {
    setStudentSearch(`${student.full_name} (${student.student_id})`);
    setSearchResults({ new: [], old: [] });
    setShowDropdown(false);
    setIsSearching(true);

    try {
      const latestData = await getStudentLatestApplication(
        student.id,
        student.source
      );
      if (latestData.success && latestData.data) {
        onSelectOldStudent(latestData.data);

        if (onDataChange) {
          onDataChange({
            student_status: 'Old',
            input_name: student.id,
            source: student.source,
            is_selected: true, 
          });
        }
      } else {
        console.error(
          'No application data found for student:',
          student.student_id
        );
        if (onDataChange) {
          onDataChange({
            student_status: 'Old',
            input_name: student.id,
            source: student.source,
            is_selected: true, 
          });
        }
      }
    } catch (err) {
      console.error('Error getting latest application:', err);
      if (onDataChange) {
        onDataChange({
          student_status: 'Old',
          input_name: student.id,
          source: student.source,
          is_selected: true, 
        });
      }
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const getDropdownWidth = () => {
    const allResults = [
      ...(searchResults.new || []),
      ...(searchResults.old || []),
    ];
    if (allResults.length === 0) return 'auto';
    const longestText = allResults.reduce((longest, student) => {
      const text = `${student.full_name} (${student.student_id})`;
      return text.length > longest.length ? text : longest;
    }, '');
    const estimatedWidth = Math.max(longestText.length * 8, 300);
    return `${estimatedWidth}px`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.sectionHeader}>
        <span className={styles.headerTitle}>STUDENT'S STATUS</span>
      </div>
      <div className={styles.contentWrapper}>
        <div
          className={`${styles.statusOptions} ${
            errors?.student_status || forceError?.student_status
              ? styles.studentStatusErrorWrapper
              : ''
          }`}
        >
          {statusOptions.map((option) => (
            <div
              key={option}
              className={option === 'Old' ? styles.optionOld : styles.optionNew}
            >
              <label
                className={styles.radioLabel}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <input
                  type='radio'
                  name='studentStatus'
                  value={option}
                  checked={status === option}
                  onChange={() => handleStatusChange(option)}
                  style={{
                    opacity: 0,
                    position: 'absolute',
                    width: 0,
                    height: 0,
                  }}
                />
                <span className={styles.radioButton}>
                  <span className={styles.radioButtonCircle} />
                  {status === option && (
                    <span className={styles.radioButtonSelected} />
                  )}
                </span>
                <span
                  className={`${styles.statusLabel} ${
                    errors?.student_status || forceError?.student_status
                      ? styles.studentStatusErrorLabel
                      : ''
                  }`}
                >
                  {option}
                </span>
              </label>

              {option === 'Old' && status === 'Old' && (
                <div className={styles.studentIdField} ref={searchRef}>
                  <label htmlFor='studentSearch' className={styles.statusLabel}>
                    Search Student
                  </label>
                  <div className={styles.searchContainer}>
                    <div className={styles.searchInputRow}>
                      <input
                        id='studentSearch'
                        className={`${styles.studentIdValue} ${
                          errors?.input_name || forceError?.input_name
                            ? styles.errorInput
                            : ''
                        }`}
                        type='text'
                        autoComplete='off'
                        value={studentSearch}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        onFocus={() =>
                          (searchResults.new?.length > 0 ||
                            searchResults.old?.length > 0) &&
                          setShowDropdown(true)
                        }
                        placeholder={'Enter Name or ID'}
                        size={Math.max(20, studentSearch.length)}
                      />
                      {isSearching && (
                        <div className={styles.searching}>Searching...</div>
                      )}
                      {(errors?.input_name || forceError?.input_name) && (
                        <div className={styles.inlineErrorText}>
                          Please search and select a student!
                        </div>
                      )}
                    </div>

                    {showDropdown &&
                      (searchResults.new?.length > 0 ||
                        searchResults.old?.length > 0) && (
                        <div
                          className={styles.searchDropdown}
                          style={{ width: getDropdownWidth() }}
                        >
                          {searchResults.new?.length > 0 && (
                            <>
                              <div className={styles.dropdownHeader}>
                                New data :
                              </div>
                              {searchResults.new.map((student, index) => (
                                <div
                                  key={`new-${student.student_id}`}
                                  className={`${styles.dropdownItem} ${
                                    index === 0 ? styles.topItemHighlight : ''
                                  }`}
                                  onClick={() =>
                                    handleSelectStudent({
                                      ...student,
                                      source: 'new',
                                    })
                                  }
                                >
                                  <span className={styles.studentName}>
                                    {student.full_name}
                                  </span>
                                  <span className={styles.studentId}>
                                    ({student.student_id})
                                  </span>
                                </div>
                              ))}
                            </>
                          )}
                          {searchResults.old?.length > 0 && (
                            <>
                              <div className={styles.dropdownHeader}>
                                Previous data :
                              </div>
                              {searchResults.old.map((student, index) => (
                                <div
                                  key={`old-${student.student_id}`}
                                  className={`${styles.dropdownItem} ${
                                    index === 0 &&
                                    (!searchResults.new ||
                                      searchResults.new.length === 0)
                                      ? styles.topItemHighlight
                                      : ''
                                  }`}
                                  onClick={() =>
                                    handleSelectStudent({
                                      ...student,
                                      source: 'old',
                                    })
                                  }
                                >
                                  <span className={styles.studentName}>
                                    {student.full_name}
                                  </span>
                                  <span className={styles.studentId}>
                                    ({student.student_id})
                                  </span>
                                </div>
                              ))}
                            </>
                          )}
                        </div>
                      )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className={styles.noteSection}>
          <div className={styles.noteWrapper}>
            <div className={styles.noteLabel}>{`Note: `}</div>
            <div className={styles.noteText}>
              <span>By selecting student's status </span>
              <span className={styles.noteTextBold}>New</span>
              <span>, </span>
              <span className={styles.noteTextBold}>Transferee </span>
              <span>, or </span>
              <span className={styles.noteTextBold}>Old </span>
              <span>
                will automatically generate a new registration number.
              </span>
            </div>
            <div className={styles.noteWarning}>
              <span>{`Please keep in mind that this action cannot be `}</span>
              <span className={styles.noteWarningBold}>undone</span>
              <span>.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StudentStatusSection;
