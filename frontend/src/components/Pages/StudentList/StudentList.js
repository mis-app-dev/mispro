import React, { useState, useEffect, useCallback, useRef } from "react";
import styles from "./StudentList.module.css";
import { useNavigate } from "react-router-dom";
import SearchBar from "../../Molecules/SearchBar/SearchBar";
import { getStudents, getRegistrationOptions, fetchAuthenticatedImage } from "../../../services/api";
import Pagination from "../../Molecules/Pagination/Pagination";
import ColumnHeader from "../../Molecules/ColumnHeader/ColumnHeader";
import placeholder from "../../../assets/user.svg";
import infoIcon from "../../../assets/info_icon.svg";
import ResetFilterButton from "../../Atoms/ResetFilterButton/ResetFilterButton";
import AutoGraduatePopup from "../../Molecules/PopUp/PopUpAutoGraduate/PopUpAutoGraduate";
import { getCurrentSchoolYearStr } from "../../../utils/schoolYear";

const ITEMS_PER_PAGE = 25;

// ===================== ROW =====================
const StudentRow = ({ student, onClick }) => {
  const enrollmentStyle =
    student.enrollment_status === "ACTIVE" ? styles.active : styles.status;

  const statusStyle = styles.status;

  const [photoSrc, setPhotoSrc] = useState(placeholder);

  useEffect(() => {
    if (!student.photo_url) return;
    fetchAuthenticatedImage(student.photo_url).then(url => {
      if (url) setPhotoSrc(url);
    });
  }, [student.photo_url]);

  return (
    <div className={styles.studentDataRow} onClick={onClick}>
      <div className={styles.tableCell}>
        <img
          src={photoSrc}
          alt=""
          loading="lazy"
          onError={(e) => (e.target.src = placeholder)}
          className={student.photo_url ? styles.photo : styles.placeholderPhoto}
          className={photoSrc !== placeholder ? styles.photo : styles.placeholderPhoto}
        />
      </div>

      <div className={styles.tableCell} title={student.student_id}>
        {student.student_id}
      </div>
      <div className={styles.tableCell} title={student.full_name}>
        {student.full_name}
      </div>
      <div className={styles.tableCell} title={student.grade}>
        {student.grade}
      </div>
      <div className={styles.tableCell} title={student.section_name}>
        {student.section_name}
      </div>
      <div className={styles.tableCell} title={student.school_year}>
        {student.school_year}
      </div>

      <div className={styles.tableCell}>
        <div className={enrollmentStyle}>
          <div className={styles.statusText}>
            {student.enrollment_status}
          </div>
        </div>
      </div>

      <div className={styles.tableCell}>
        <div className={styles.status}>
          <div className={styles.statusText}>
            {student.student_status}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===================== MAIN =====================
const StudentList = () => {
  const navigate = useNavigate();
  
  const hasFetchedOptions = useRef(false);
  const hasFetchedStudents = useRef(false);

  const [studentData, setStudentData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [totalPages, setTotalPages] = useState(1);

  //const [currentPage, setCurrentPage] = useState(1);
  // const [search, setSearch] = useState("");
  // const [filters, setFilters] = useState({});
  // const [sorts, setSorts] = useState([]);

  //change declaration of search filter and short
  const [search, setSearch] = useState(() => {
    return sessionStorage.getItem("studentList_search") || "";
  });
  const [filters, setFilters] = useState(() => {
    const saved = sessionStorage.getItem("studentList_filters");
    return saved ? JSON.parse(saved) : {};
  });
  const [sorts, setSorts] = useState(() => {
    const saved = sessionStorage.getItem("studentList_sorts");
    return saved ? JSON.parse(saved) : [];
  });
  const [currentPage, setCurrentPage] = useState(() => {
    return Number(sessionStorage.getItem("studentList_page")) || 1;
  });
  //this is just try man

  const [isInitialized, setIsInitialized] = useState(false);
  const [showAutoGraduate, setShowAutoGraduate] = useState(false);

  const [filterOptions, setFilterOptions] = useState({
    sections: [],
    classes: [],
    schoolYears: [],
    enrollmentStatus: [
      { id: "ACTIVE", name: "Active" },
      { id: "INACTIVE", name: "Inactive" },
    ],
    studentStatus: [
      { id: "Not Graduate", name: "Not Graduate" },
      { id: "Graduate", name: "Graduate" },
      { id: "Withdraw", name: "Withdraw" },
      { id: "Expelled", name: "Expelled" },
    ],
  });

  // ===================== FETCH STUDENTS =====================
  const fetchStudents = useCallback(
    async (page = 1) => {
      // console.log("FETCHING STUDENTS...", {
      //   page,
      //   search,
      //   filters,
      //   sorts,
      //   time: new Date().toISOString(),
      // });

      setLoading(true);

      try {
        const params = {
          ...filters,
          search: search || undefined,
          search_name: search ? undefined : filters.search_name || undefined,
          sort: sorts.length > 0 ? sorts : undefined,
          page,
          per_page: ITEMS_PER_PAGE,
        };

        const res = await getStudents(params);

        setStudentData(res.data?.data || []);
        setTotalPages(res.data?.last_page || 1);
        setCurrentPage(res.data?.current_page || 1);
      } catch (err) {
        console.error("Error fetching students:", err);
      } finally {
        setLoading(false);
      }
    },
    [search, filters, sorts]
  );

  // ===================== FETCH OPTIONS (ONLY ONCE) =====================
  useEffect(() => {
    if (hasFetchedOptions.current) return;
    hasFetchedOptions.current = true;

    // console.log("INIT FILTER OPTIONS");

    const fetchOptions = async () => {
      try {
        const opts = await getRegistrationOptions({
          only: "sections,classes,school_years"
        });
        const schoolYears = opts.school_years || [];

        setFilterOptions((prev) => ({
          ...prev,
          sections: opts.sections || [],
          classes: opts.classes || [],
          schoolYears: schoolYears,
        }));

        // FIRSTLOAD DEFAULT SCHOOL YEAR
        const currentSY = getCurrentSchoolYearStr();
        const foundSY = schoolYears.find((sy) => sy.year === currentSY);

        if (foundSY) {
          handleFilterChange("school_year_id", [foundSY.school_year_id]);
        }
      } catch (err) {
        console.error("Error fetching registration options:", err);
      } finally {
        setIsInitialized(true);
      }
    };

    fetchOptions();
  }, []);

  // ===================== FETCH STUDENTS =====================
  useEffect(() => {
    if (!isInitialized) return;

    // FIRST LOAD
    if (!hasFetchedStudents.current) {
      hasFetchedStudents.current = true;
      fetchStudents(1);
      return;
    }

    // NEXT LOAD (SEARCH / FILTER / SORT)
    const timer = setTimeout(() => {
      fetchStudents(currentPage);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, filters, sorts, currentPage, isInitialized]);

  // ===================== CLEAN SEARCH_NAME =====================
  useEffect(() => {
    if (search && filters.search_name) {
      setFilters((prev) => {
        const newFilters = { ...prev };
        delete newFilters.search_name;
        return newFilters;
      });
    }
  }, [search, filters.search_name]);

  //ini tambahan 
  // ===================== PERSIST FILTERS TO SESSIONSTORAGE =====================
  useEffect(() => {
    sessionStorage.setItem("studentList_search", search);
  }, [search]);

  useEffect(() => {
    sessionStorage.setItem("studentList_filters", JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    sessionStorage.setItem("studentList_sorts", JSON.stringify(sorts));
  }, [sorts]);

  useEffect(() => {
    sessionStorage.setItem("studentList_page", String(currentPage));
  }, [currentPage]);

  // ===================== HANDLERS =====================
  const handlePageChange = (page) => setCurrentPage(page);

  const handleSortChange = (fieldKey) => {
    setSorts((prev) => {
      const current = prev[0]?.field === fieldKey ? prev[0] : null;

      let next;
      if (!current) next = { field: fieldKey, order: "asc" };
      else if (current.order === "asc") next = { field: fieldKey, order: "desc" };
      else next = null;

      return next ? [next] : [];
    });

    setCurrentPage(1);
  };

  const handleFilterChange = (filterKey, selectedValue) => {
    setFilters((prev) => {
      const newFilters = { ...prev };

      if (Array.isArray(selectedValue) && selectedValue.length > 0) {
        newFilters[filterKey] = selectedValue;
      } else if (selectedValue) {
        newFilters[filterKey] = selectedValue;
      } else {
        delete newFilters[filterKey];
      }

      if (filterKey === "search_name" && selectedValue) {
        setSearch("");
      }

      return newFilters;
    });

    setCurrentPage(1);
  };

  const getSortOrder = (fieldKey) =>
    sorts.find((s) => s.field === fieldKey)?.order;

  // ===================== UI =====================
  return (
    <div className={styles.studentListContainer}>
      <div>
        <h1 className={styles.pageTitle}>Student List</h1>

        <div className={styles.searchAndFilterContainer}>
          <SearchBar
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            placeholder="Find name or student id"
          />

          {/* <ResetFilterButton
            onClick={() => {
              setSearch("");
              setFilters({});
              setSorts([]);
            }}
          /> */}

          {/* tambahan untuk reset filter button */}
          <ResetFilterButton
            onClick={() => {
              setSearch("");
              setFilters({});
              setSorts([]);
              setCurrentPage(1);
              sessionStorage.removeItem("studentList_search");
              sessionStorage.removeItem("studentList_filters");
              sessionStorage.removeItem("studentList_sorts");
              sessionStorage.removeItem("studentList_page");
            }}
          />

        </div>
      </div>

      <div>
        <div className={styles.autoGraduateParent}>
          <div
            className={styles.autoGraduate}
            onClick={() => setShowAutoGraduate(true)}
            style={{ cursor: "pointer" }}
          >
            Auto Graduate
          </div>

          <img className={styles.infoIcon} alt="Info" src={infoIcon} />
        </div>

        <div className={styles.tableContainer}>
          <div className={styles.tableHeaderGrid}>
            <ColumnHeader
              title="Photo"
              hasSort={true}
              hasFilter={true}
              disableFilter={true}
              disableSort={true}
            />

            <ColumnHeader
              title="Student ID"
              hasSort={true}
              fieldKey="student_id"
              sortOrder={getSortOrder("student_id")}
              onSort={handleSortChange}
              hasFilter={false}
            />

            <ColumnHeader
              title="Student Name"
              hasSort={true}
              fieldKey="full_name"
              sortOrder={getSortOrder("full_name")}
              onSort={handleSortChange}
              hasFilter={true}
              filterType="search"
              filterKey="search_name"
              onFilterChange={handleFilterChange}
              currentFilterValue={filters.search_name}
            />

            <ColumnHeader
              title="Grade"
              hasSort={true}
              fieldKey="grade"
              sortOrder={getSortOrder("grade")}
              onSort={handleSortChange}
              hasFilter={true}
              filterKey="class_id"
              onFilterChange={handleFilterChange}
              filterOptions={filterOptions.classes}
              valueKey="class_id"
              labelKey="grade"
              currentFilterValue={filters.class_id}
            />

            <ColumnHeader
              title="Section"
              hasSort={true}
              fieldKey="section"
              sortOrder={getSortOrder("section")}
              onSort={handleSortChange}
              hasFilter={true}
              filterKey="section_id"
              onFilterChange={handleFilterChange}
              filterOptions={filterOptions.sections}
              valueKey="section_id"
              labelKey="name"
              currentFilterValue={filters.section_id}
            />

            <ColumnHeader
              title="School Year"
              hasSort={false}
              hasFilter={true}
              filterKey="school_year_id"
              onFilterChange={handleFilterChange}
              filterOptions={filterOptions.schoolYears}
              valueKey="school_year_id"
              labelKey="year"
              currentFilterValue={filters.school_year_id}
              singleSelect={true}
            />

            <ColumnHeader
              title="Enrollment"
              hasSort={true}
              fieldKey="enrollment_status"
              sortOrder={getSortOrder("enrollment_status")}
              onSort={handleSortChange}
              hasFilter={true}
              filterKey="enrollment_status"
              onFilterChange={handleFilterChange}
              filterOptions={filterOptions.enrollmentStatus}
              valueKey="id"
              labelKey="name"
              currentFilterValue={filters.enrollment_status}
            />

            <ColumnHeader
              title="Status"
              hasSort={true}
              fieldKey="student_status"
              sortOrder={getSortOrder("student_status")}
              onSort={handleSortChange}
              hasFilter={true}
              filterKey="student_status"
              onFilterChange={handleFilterChange}
              filterOptions={filterOptions.studentStatus}
              valueKey="id"
              labelKey="name"
              currentFilterValue={filters.student_status}
            />
          </div>

          <div className={styles.tableBody}>
            {loading ? (
              <div className={styles.messageCell}>Loading...</div>
            ) : studentData.length > 0 ? (
              studentData.map((student) => (
                <StudentRow
                  key={student.id}
                  student={student}
                  onClick={() =>
                    navigate(`/students/${student.id}`, {
                      state: { fromList: true },
                    })
                  }
                />
              ))
            ) : (
              <div className={styles.messageCell}>No data available</div>
            )}
          </div>
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      )}

      {showAutoGraduate && (
        <AutoGraduatePopup
          onClose={() => setShowAutoGraduate(false)}
          onSuccess={() => fetchStudents(currentPage)}
        />
      )}
    </div>
  );
};

export default StudentList;