import React, { useEffect, useState, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import styles from "./PopUpAutoGraduate.module.css";
import Button from "../../../Atoms/Button/Button";
import Checkbox from "../../../Atoms/Checkbox/Checkbox";
import ColumnHeader from "../../ColumnHeader/ColumnHeader";
import {
  getAutoGraduatePreview,
  confirmAutoGraduate,
  fetchAuthenticatedImage,
} from "../../../../services/api";
import placeholder from "../../../../assets/user.svg";
import ConfirmUpdatePopup from "../PopUpUpdate/PopUpConfirmUpdate";
import UpdatedNotification from "../UpdateNotification/UpdateNotification";

const AuthImg = ({ src, className }) => {
  const [imgSrc, setImgSrc] = useState(placeholder);
  useEffect(() => {
    if (!src) return;
    fetchAuthenticatedImage(src).then(url => {
      if (url) setImgSrc(url);
    });
  }, [src]);
  return <img src={imgSrc} alt="" className={className} />;
};

const REFRESH_INTERVAL = 5000;

const AutoGraduatePopup = ({ onClose, onSuccess }) => {
  const [students, setStudents] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [schoolYear, setSchoolYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isSuccessOpen, setIsSuccessOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const fetchData = useCallback(async (isBackgroundRefresh = false) => {
    try {
      if (!isBackgroundRefresh) setLoading(true);
      const res = await getAutoGraduatePreview();
      if (res.success) {
        setSchoolYear(res.current_school_year);
        setStudents(res.students || []);
        if (!isBackgroundRefresh) {
          const allIds = (res.students || []).map((s) => s.id);
          setSelectedIds(allIds);
        }
      }
    } catch (error) {
      console.error("Error fetching auto graduate preview:", error);
      if (!isBackgroundRefresh) {
        alert("Failed to load student data.");
        if (onCloseRef.current) onCloseRef.current();
      }
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!isConfirmOpen && !isSuccessOpen) {
        fetchData(true);
      }
    }, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [fetchData, isConfirmOpen, isSuccessOpen]);

  const handleSelectAll = () => {
    const allIds = students.map((s) => s.id);
    setSelectedIds(allIds);
  };

  const handleUnselectAll = () => {
    setSelectedIds([]);
  };

  const handleCheckboxChange = (id) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((item) => item !== id);
      return [...prev, id];
    });
  };

  const handleInitialConfirmClick = () => {
    if (selectedIds.length === 0) {
      alert("Please select at least one student.");
      return;
    }
    setIsConfirmOpen(true);
  };

  const handleExecuteUpdate = async () => {
    try {
      setIsUpdating(true);
      const res = await confirmAutoGraduate(selectedIds);

      if (res.success) {
        setIsConfirmOpen(false);
        setIsSuccessOpen(true);
      }
    } catch (error) {
      console.error("Error confirming auto graduate:", error);
      alert(error.response?.data?.message || "Failed to process auto graduation.");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFinish = () => {
    setIsSuccessOpen(false);
    onSuccess();
    onClose();
  };

  return ReactDOM.createPortal(
    <>
      <div className={styles.overlay}>
        <div className={styles.eautoGraduatePopup}>
          {/* Header Section */}
          <div className={styles.autoGraduateSy20252026Parent}>
            <div className={`${styles.autoGraduateSy} ${styles.headerTitle}`}>
              Auto graduate S.Y {schoolYear}
            </div>
            {!loading && (
              <div className={styles.unselectAllParent}>
                <Button variant="chip-danger" onClick={handleUnselectAll}>
                  Unselect All
                </Button>
                <Button variant="chip-primary" onClick={handleSelectAll}>
                  Select All
                </Button>
              </div>
            )}
          </div>

          {/* Table Section */}
          <div className={styles.eautoGraduatePopupInner}>
            {loading ? (
              <div className={styles.loadingContainer}>
                Loading student data...
              </div>
            ) : (
              <div className={styles.tableWrapper}>
                <div className={styles.tableHeader}>
                  <div className={`${styles.headerCell} ${styles.alignCenter}`}>
                    <ColumnHeader title="No." disableSort disableFilter />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignCenter}`}>
                    <ColumnHeader title="" disableSort disableFilter />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader title="Photo" disableSort disableFilter />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader
                      title="Student ID"
                      disableSort
                      disableFilter
                    />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader
                      title="Student Name"
                      disableSort
                      disableFilter
                    />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader title="Section" disableSort disableFilter />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader title="Grade" disableSort disableFilter />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader
                      title="School Year"
                      disableSort
                      disableFilter
                    />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader title="Status" disableSort disableFilter />
                  </div>
                  <div className={`${styles.headerCell} ${styles.alignLeft}`}>
                    <ColumnHeader
                      title="Enrollment"
                      disableSort
                      disableFilter
                    />
                  </div>
                </div>

                <div className={styles.tableBody}>
                  {students.map((student, index) => {
                    const enrollmentStyle =
                      student.enrollment_status === "ACTIVE"
                        ? styles.active
                        : styles.inactive;
                    const statusStyle = styles.statusBadge;

                    return (
                      <div key={student.id} className={styles.tableRow}>
                        <div className={`${styles.cell} ${styles.alignCenter}`}>
                          {index + 1}
                        </div>
                        <div className={`${styles.cell} ${styles.alignCenter}`}>
                          <Checkbox
                            checked={selectedIds.includes(student.id)}
                            onChange={() => handleCheckboxChange(student.id)}
                          />
                        </div>
                        <div className={`${styles.cell} ${styles.alignLeft}`}>
                          <AuthImg
                            src={student.photo_url}
                            className={
                              student.photo_url
                                ? styles.photo
                                : styles.placeholderPhoto
                            }
                          />
                        </div>
                        <div
                          className={`${styles.cell} ${styles.alignLeft}`}
                          title={student.student_id}
                        >
                          {student.student_id}
                        </div>
                        <div
                          className={`${styles.cell} ${styles.alignLeft}`}
                          title={student.full_name}
                        >
                          {student.full_name}
                        </div>
                        <div className={`${styles.cell} ${styles.alignLeft}`}>
                          {student.section_name}
                        </div>
                        <div className={`${styles.cell} ${styles.alignLeft}`}>
                          {student.grade}
                        </div>
                        <div className={`${styles.cell} ${styles.alignLeft}`}>
                          {student.school_year}
                        </div>
                        <div className={`${styles.cell} ${styles.alignLeft}`}>
                          <div className={statusStyle}>
                            <div className={styles.statusText}>
                              {student.status}
                            </div>
                          </div>
                        </div>
                        <div className={`${styles.cell} ${styles.alignLeft}`}>
                          <div className={enrollmentStyle}>
                            <div className={styles.statusText}>
                              {student.enrollment_status}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className={styles.eautoGraduatePopupChild}>
            <div className={styles.buttonParent}>
              <Button variant="outline" onClick={onClose} disabled={isUpdating}>
                Cancel
              </Button>
              <Button
                variant="solid"
                onClick={handleInitialConfirmClick}
                disabled={loading || selectedIds.length === 0}
              >
                {`Confirm (${selectedIds.length})`}
              </Button>
            </div>
          </div>
        </div>
      </div>
      <ConfirmUpdatePopup
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleExecuteUpdate}
        isUpdating={isUpdating}
      />

      <UpdatedNotification isOpen={isSuccessOpen} onClose={handleFinish} />
    </>,
    document.body
  );
};

export default AutoGraduatePopup;
