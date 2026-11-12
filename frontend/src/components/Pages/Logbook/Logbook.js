import React, { useState, useEffect, useCallback } from "react";
import styles from "./Logbook.module.css";
import TableHeaderController from "../../Molecules/TableHeaderController/TableHeaderController";
import Button from "../../Atoms/Button/Button";
import ExportLogbookPopup from "./ExportLogbookPopup/ExportLogbookPopup";
import FilterPopup from "../../Molecules/FilterPopUp/FilterPopUp";
import filterStyles from "../../Molecules/FilterPopUp/FilterPopUp.module.css";
import Pagination from "../../Molecules/Pagination/Pagination";
import {
  getLogbook,
  getRegistrationOptions,
  getLogbookForExport,
  fetchAuthenticatedImage,
} from "../../../services/api";
import placeholder from "../../../assets/user.svg";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const AuthImg = ({ src, alt, className }) => {
  const [imgSrc, setImgSrc] = useState(placeholder);
  useEffect(() => {
    if (!src) return;
    fetchAuthenticatedImage(src).then(url => {
      if (url) setImgSrc(url);
    });
  }, [src]);
  return <img src={imgSrc} alt={alt} className={className} />;
};

const INITIAL_HEADERS = [
  "Photo",
  "Student ID",
  "Full Name",
  "First Name",
  "Middle Name",
  "Last Name",
  "Grade",
  "Section",
  "Major",
  "School Year",
  "Gender",
  "Registration Date",
  "Transportation",
  "NISN",
  "Family Rank",
  "Place DOB",
  "Age",
  "Religion",
  "Citizenship",
  "Country",
  "Previous School",
  "Address",
  "Phone",
  "Father Name",
  "Father Occupation",
  "Father Phone",
  "Mother Name",
  "Mother Occupation",
  "Mother Phone",
  "NIK",
  "KITAS",
];

// Name parts a student does not have stay empty instead of showing "-".
const BLANK_WHEN_EMPTY = new Set(["First Name", "Middle Name", "Last Name"]);

const REFRESH_INTERVAL = 5000;

const HEADER_KEY_MAP = {
  Photo: "photo_url",
  "Student ID": "student_id",
  "Full Name": "full_name",
  "First Name": "first_name",
  "Middle Name": "middle_name",
  "Last Name": "last_name",
  Grade: "grade",
  Section: "section",
  Major: "major",
  "School Year": "school_year",
  Gender: "gender",
  "Registration Date": "registration_date",
  Transportation: "transportation",
  NISN: "nisn",
  "Family Rank": "family_rank",
  "Place DOB": "place_dob",
  Age: "age",
  Religion: "religion",
  Citizenship: "citizenship",
  Country: "country",
  "Previous School": "previous_school",
  Address: "address",
  Phone: "phone",
  "Father Name": "father_name",
  "Father Occupation": "father_occupation",
  "Father Phone": "father_phone",
  "Mother Name": "mother_name",
  "Mother Occupation": "mother_occupation",
  "Mother Phone": "mother_phone",
  NIK: "nik",
  KITAS: "kitas",
};

const SORT_CONFIG_MAP = {
  "Student ID": "student_id",
  "Full Name": "full_name",
  "First Name": "first_name",
  "Middle Name": "middle_name",
  "Last Name": "last_name",
  Grade: "grade",
  Section: "section",
  Major: "major",
  "School Year": "school_year",
  Gender: "gender",
  "Registration Date": "registration_date",
  Transportation: "transportation",
  "Family Rank": "family_rank",
  Age: "age",
  Religion: "religion",
  Citizenship: "citizenship",
  Country: "country",
  "Previous School": "previous_school",
  "Father Name": "father_name",
  "Father Occupation": "father_occupation",
  "Mother Name": "mother_name",
  "Mother Occupation": "mother_occupation",
};

const FILTER_CONFIG_MAP = {
  "Full Name": { type: "search", apiKeys: ["search_name"] },
  "Family Rank": { type: "search", apiKeys: ["search_family_rank"] },
  Religion: { type: "search", apiKeys: ["search_religion"] },
  Country: { type: "search", apiKeys: ["search_country"] },
  "Previous School": { type: "search", apiKeys: ["search_previous_school"] },
  Major: {
    type: "checkbox",
    apiKeys: ["majors"],
    optionsKey: "majors",
    valueKey: "major_id",
    labelKey: "name",
  },
  Citizenship: {
    type: "checkbox",
    apiKeys: ["citizenships"],
    optionsKey: "citizenships",
    valueKey: "id",
    labelKey: "name",
  },
  "Father Name": { type: "search", apiKeys: ["search_father"] },
  "Mother Name": { type: "search", apiKeys: ["search_mother"] },

  Grade: {
    type: "checkbox",
    apiKeys: ["grades"],
    optionsKey: "classes",
    valueKey: "grade",
    labelKey: "grade",
  },
  Section: {
    type: "checkbox",
    apiKeys: ["sections"],
    optionsKey: "sections",
    valueKey: "name",
    labelKey: "name",
  },
  Gender: {
    type: "checkbox",
    apiKeys: ["genders"],
    optionsKey: "genders",
    valueKey: "id",
    labelKey: "name",
  },
  Transportation: {
    type: "checkbox",
    apiKeys: ["transportations"],
    optionsKey: "transportations",
    valueKey: "type",
    labelKey: "type",
  },
  "School Year": {
    type: "checkbox",
    apiKeys: ["school_years"],
    optionsKey: "schoolYears",
    valueKey: "year",
    labelKey: "year",
    singleSelect: true,
  },
  "Registration Date": {
    type: "date-range",
    apiKeys: ["start_date", "end_date"],
  },
  Age: { type: "number-range", apiKeys: ["min_age", "max_age"] },
};
const SortableHeader = ({
  header,
  selectedColumns,
  handleColumnSelect,
  sortDirection,
  onSortClick,
  isFilterActive,
  isFilterApplied,
  onFilterClick,
  showFilterPopup,
  filterPopupNode,
  disableSort,
  disableFilter,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: header });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableHeaderController
      ref={setNodeRef}
      style={style}
      listeners={listeners}
      {...attributes}
      title={header}
      controlsDisabled={header === "Photo"}
      showCheckbox={true}
      isChecked={selectedColumns.has(header)}
      onChange={(e) => handleColumnSelect(header, e.target.checked)}
      sortDirection={sortDirection}
      onSortClick={onSortClick}
      isFilterActive={isFilterActive}
      isFilterApplied={isFilterApplied}
      onFilterClick={onFilterClick}
      showFilterPopup={showFilterPopup}
      filterPopupNode={filterPopupNode}
      disableSort={disableSort}
      disableFilter={disableFilter}
    />
  );
};

const Logbook = () => {
  const [logbookData, setLogbookData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filterOptions, setFilterOptions] = useState({
    classes: [],
    sections: [],
    schoolYears: [],
    transportations: [],
    majors: [],
    genders: [
      { id: "MALE", name: "Male" },
      { id: "FEMALE", name: "Female" },
    ],
    citizenships: [
      { id: "Indonesia", name: "Indonesia" },
      { id: "Non Indonesia", name: "Non Indonesia" },
    ],
  });
  const [columns, setColumns] = useState(INITIAL_HEADERS);
  const [selectedColumns, setSelectedColumns] = useState(
    new Set(INITIAL_HEADERS)
  );
  const [isExportPopupOpen, setIsExportPopupOpen] = useState(false);
  const [filters, setFilters] = useState({});
  const [sorts, setSorts] = useState([]);
  const [activeFilter, setActiveFilter] = useState(null);
  const [exportLoading, setExportLoading] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor));
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const opts = await getRegistrationOptions();
        setFilterOptions((prev) => ({
          ...prev,
          classes: opts.classes || [],
          sections: opts.sections || [],
          schoolYears: opts.school_years || [],
          transportations: opts.transportations || [],
          majors: opts.majors || [],
        }));
      } catch (err) {
        console.error("Error fetching registration options:", err);
      }
    };
    fetchFilterOptions();
  }, []);
  const fetchLogbookData = useCallback(
    async (page = 1, options = {}) => {
      const { isBackgroundRefresh = false } = options;
      if (!isBackgroundRefresh) setLoading(true);
      const apiParams = {
        page: page,
        per_page: 25,
      };
      for (const headerTitle in filters) {
        const config = FILTER_CONFIG_MAP[headerTitle];
        const value = filters[headerTitle];

        if (config && value) {
          if (config.type === "search") {
            apiParams[config.apiKeys[0]] = value;
          } else if (config.type === "checkbox") {
            apiParams[config.apiKeys[0]] = value;
          } else if (config.type === "date-range") {
            apiParams[config.apiKeys[0]] = value[0] || undefined;
            apiParams[config.apiKeys[1]] = value[1] || undefined;
          } else if (config.type === "number-range") {
            apiParams[config.apiKeys[0]] = value[0] || undefined;
            apiParams[config.apiKeys[1]] = value[1] || undefined;
          }
        }
      }
      apiParams.sort = sorts.length > 0 ? sorts : undefined;
      try {
        const res = await getLogbook(apiParams);
        setLogbookData(res.data || []);
        setTotalPages(res.meta?.last_page || 1);
        setCurrentPage(res.meta?.current_page || 1);
      } catch (error) {
        console.error("Failed to fetch logbook data:", error);
        setLogbookData([]);
        setTotalPages(1);
        setCurrentPage(1);
      } finally {
        if (!isBackgroundRefresh) setLoading(false);
      }
    },
    [filters, sorts]
  );

  const fetchFullLogbookData = useCallback(async () => {
    setExportLoading(true);
    const apiParams = {};

    for (const headerTitle in filters) {
      const config = FILTER_CONFIG_MAP[headerTitle];
      const value = filters[headerTitle];

      if (config && value) {
        if (config.type === "search") {
          apiParams[config.apiKeys[0]] = value;
        } else if (config.type === "checkbox") {
          apiParams[config.apiKeys[0]] = value;
        } else if (config.type === "date-range") {
          apiParams[config.apiKeys[0]] = value[0] || undefined;
          apiParams[config.apiKeys[1]] = value[1] || undefined;
        } else if (config.type === "number-range") {
          apiParams[config.apiKeys[0]] = value[0] || undefined;
          apiParams[config.apiKeys[1]] = value[1] || undefined;
        }
      }
    }
    apiParams.sort = sorts.length > 0 ? sorts : undefined;
    try {
      const res = await getLogbookForExport(apiParams);
      return res.data || [];
    } catch (error) {
      console.error("Failed to fetch full logbook data for export:", error);
      throw error;
    } finally {
      setExportLoading(false);
    }
  }, [filters, sorts]);
  useEffect(() => {
    fetchLogbookData(1);
  }, [filters, sorts, fetchLogbookData]);
  useEffect(() => {
    const refreshData = () => {
      fetchLogbookData(currentPage, { isBackgroundRefresh: true });
    };

    const intervalId = setInterval(refreshData, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [currentPage, fetchLogbookData]);
  const handlePageChange = (page) => {
    setCurrentPage(page);
    fetchLogbookData(page);
  };
  const handleColumnSelect = (columnTitle, isChecked) => {
    const newSelectedColumns = new Set(selectedColumns);
    if (isChecked) {
      newSelectedColumns.add(columnTitle);
    } else {
      newSelectedColumns.delete(columnTitle);
    }
    setSelectedColumns(newSelectedColumns);
  };
  const selectAllColumns = () => {
    setSelectedColumns(new Set(columns));
  };
  const unselectAllColumns = () => {
    setSelectedColumns(new Set());
  };
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setColumns((items) => {
        const oldIndex = items.indexOf(active.id);
        const newIndex = items.indexOf(over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };
  const handleOpenExportPopup = () => {
    setIsExportPopupOpen(true);
  };
  const handleCloseExportPopup = () => {
    setIsExportPopupOpen(false);
  };
  const handleSortClick = (headerTitle) => {
    const fieldKey = SORT_CONFIG_MAP[headerTitle];
    if (!fieldKey) return;

    setSorts((prev) => {
      const current = prev[0]?.field === fieldKey ? prev[0] : null;
      let next;

      if (!current) next = { field: fieldKey, order: "asc" };
      else if (current.order === "asc")
        next = { field: fieldKey, order: "desc" };
      else next = null;

      return next ? [next] : [];
    });
  };
  const handleFilterClick = (headerTitle) => {
    const config = FILTER_CONFIG_MAP[headerTitle];
    if (!config) return;

    setActiveFilter({
      column: headerTitle,
      config: config,
      initialValue: filters[headerTitle],
    });
  };
  const handleFilterClose = () => setActiveFilter(null);
  const handleFilterSubmit = (value) => {
    const column = activeFilter.column;

    setFilters((prev) => {
      const newFilters = { ...prev };
      const isEmpty =
        value === null ||
        value === undefined ||
        value === "" ||
        (Array.isArray(value) && value.length === 0) ||
        (Array.isArray(value) && value.every((v) => v === "" || v === null));

      if (isEmpty) {
        delete newFilters[column];
      } else {
        newFilters[column] = value;
      }
      return newFilters;
    });

    setActiveFilter(null);
  };
  return (
    <div className={styles.logbookPage}>
      <div className={styles.logbookContainer}>
        <header className={styles.logbookHeader}>
          <h1>Logbooks</h1>
          <Button variant="solid" onClick={handleOpenExportPopup}>
            Download PDF
          </Button>
        </header>
        <div className={styles.selectionControls}>
          <Button variant="chip-danger" onClick={unselectAllColumns}>
            Unselect All
          </Button>
          <Button variant="chip-primary" onClick={selectAllColumns}>
            Select All
          </Button>
        </div>

        <div className={styles.tableWrapper}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <table className={styles.logbookTable}>
              <thead>
                <tr>
                  <SortableContext
                    items={columns}
                    strategy={horizontalListSortingStrategy}
                  >
                    {columns.map((header) => {
                      const sortField = SORT_CONFIG_MAP[header];
                      const filterConfig = FILTER_CONFIG_MAP[header];
                      const sortOrder =
                        sorts.find((s) => s.field === sortField)?.order ||
                        "none";
                      const appliedValue = filters[header];
                      const isFilterApplied =
                        appliedValue != null &&
                        appliedValue !== "" &&
                        !(
                          Array.isArray(appliedValue) &&
                          appliedValue.length === 0
                        ) &&
                        !(
                          Array.isArray(appliedValue) &&
                          appliedValue.every((v) => v === "")
                        );
                      const isFilterActive = activeFilter?.column === header;
                      let filterPopupNode = null;
                      if (isFilterActive) {
                        const config = activeFilter.config;
                        const options = filterOptions[config.optionsKey] || [];

                        filterPopupNode = (
                          <FilterPopup
                            options={options}
                            valueKey={config.valueKey}
                            labelKey={config.labelKey}
                            filterType={config.type}
                            filterKey={config.apiKeys[0]}
                            initialValue={activeFilter.initialValue}
                            singleSelect={config.singleSelect || false}
                            onSubmit={handleFilterSubmit}
                            onClose={handleFilterClose}
                            className={
                              config.type === "date-range" ||
                              config.type === "number-range"
                                ? filterStyles.popupDateRange
                                : ""
                            }
                          />
                        );
                      }

                      return (
                        <SortableHeader
                          key={header}
                          header={header}
                          selectedColumns={selectedColumns}
                          handleColumnSelect={handleColumnSelect}
                          sortDirection={sortOrder}
                          onSortClick={() => handleSortClick(header)}
                          disableSort={!sortField}
                          isFilterActive={isFilterActive}
                          isFilterApplied={isFilterApplied}
                          onFilterClick={() => handleFilterClick(header)}
                          disableFilter={!filterConfig}
                          showFilterPopup={isFilterActive}
                          filterPopupNode={filterPopupNode}
                        />
                      );
                    })}
                  </SortableContext>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={columns.length} className={styles.messageCell}>
                      Loading...
                    </td>
                  </tr>
                ) : logbookData.length > 0 ? (
                  logbookData.map((item) => (
                    <tr key={item.student_id}>
                      {columns.map((header) => {
                        const dataKey = HEADER_KEY_MAP[header];
                        const isSelected = selectedColumns.has(header);

                        if (header === "Photo") {
                          return (
                            <td
                              key={header}
                              className={`${styles.cellPhoto} ${
                                isSelected ? styles.selectedCell : ""
                              }`}
                            >
                              <AuthImg
                                src={item[dataKey]}
                                alt={item.full_name}
                                className={styles.studentPhoto}
                              />
                            </td>
                          );
                        }

                        return (
                          <td
                            key={header}
                            className={isSelected ? styles.selectedCell : ""}
                          >
                            {item[dataKey] || (BLANK_WHEN_EMPTY.has(header) ? "" : "-")}
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={columns.length} className={styles.messageCell}>
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </DndContext>
        </div>

        {!loading && totalPages > 1 && (
          <div className={styles.paginationContainer}>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </div>
      <ExportLogbookPopup
        isOpen={isExportPopupOpen}
        onClose={handleCloseExportPopup}
        columns={columns}
        selectedColumns={selectedColumns}
        fetchFullData={fetchFullLogbookData}
        isExportLoading={exportLoading}
        currentFilters={filters}
      />
    </div>
  );
};

export default Logbook;
