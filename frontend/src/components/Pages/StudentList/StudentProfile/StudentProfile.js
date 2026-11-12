import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  useParams,
  useLocation,
  useNavigate,
  useBlocker,
} from "react-router-dom";
import {
  getStudentLatestApplication,
  getRegistrationOptions,
  updateStudent,
  getStudentHistoryDates,
  getHistoryDetail,
  // eslint-disable-next-line
  getRegistrationPreview,
} from "../../../../services/api";
import Select from "react-select";
import styles from "./StudentProfile.module.css";
import ConfirmUpdatePopup from "../../../Molecules/PopUp/PopUpUpdate/PopUpConfirmUpdate.js";
import UpdatedNotification from "../../../Molecules/PopUp/UpdateNotification/UpdateNotification.js";
import PhotoUploadPopup from "../../../Molecules/PopUp/PhotoUploadPopup/PhotoUploadPopup.js";
import Main from "../../../Layout/Main.js";
import gsap from "gsap";
import StudentProfileHeader from "./StudentProfileHeader/StudentProfileHeader.js";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import ConfirmBackPopup from "../../../Molecules/PopUp/PopUpBackConfirm/PopUpBackConfirm.js";

gsap.registerPlugin(ScrollToPlugin);

const RadioDisplay = ({
  label,
  isSelected,
  isEditing,
  name,
  value,
  onChange,
}) => {
  const content = (
    <>
      <div className={styles.visualRadio}>
        <div
          className={`${styles.radioOuter} ${
            isSelected ? styles.radioOuterSelected : ""
          }`}
        />
        {isSelected && <div className={styles.radioInner} />}
      </div>
      <span style={{ fontWeight: isSelected ? "bold" : "normal" }}>
        {label}
      </span>
    </>
  );

  if (isEditing) {
    return (
      <div
        className={styles.clickableLabel}
        onClick={() => onChange(name, value)}
        style={{ cursor: "pointer" }}
      >
        {content}
      </div>
    );
  }

  return <div className={styles.optionItem}>{content}</div>;
};

const CheckboxDisplay = ({ label, isSelected, isEditing, name, onChange }) => {
  const content = (
    <>
      {" "}
      <div className={styles.visualCheckbox}>
        {" "}
        <div
          className={`${styles.checkboxOuter} ${
            isSelected ? styles.checkboxOuterSelected : ""
          }`}
        />{" "}
        {isSelected && <div className={styles.checkboxCheckmark}>✓</div>}{" "}
      </div>{" "}
      <span style={{ fontWeight: isSelected ? "bold" : "normal" }}>
        {label}
      </span>{" "}
    </>
  );

  if (isEditing) {
    return (
      <label className={styles.clickableLabel}>
        <input
          type="checkbox"
          name={name}
          checked={isSelected}
          onChange={onChange}
          className={styles.hiddenInput}
        />
        {content}
      </label>
    );
  }

  return <div className={styles.optionItem}>{content}</div>;
};

const StudentProfile = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileData, setProfileData] = useState(null);
  const [formData, setFormData] = useState(null);
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [studentInfo, setStudentInfo] = useState({});
  const [academicStatusOptions, setAcademicStatusOptions] = useState([]);
  const [genderOptions, setGenderOptions] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [scrollTrigger, setScrollTrigger] = useState(0);
  const [historyDates, setHistoryDates] = useState([]);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [studentData, setStudentData] = useState(null);
  const blocker = useBlocker(isEditing);
  const [isPhotoPopupOpen, setIsPhotoPopupOpen] = useState(false);
  const citizenshipOptions = [
    { value: "Indonesia", label: "Indonesia" },
    { value: "Non Indonesia", label: "Non Indonesia" },
  ];
  const currentApplicationId = studentData?.application_id;
  const religionOptions = [
    "Islam",
    "Kristen",
    "Katolik",
    "Hindu",
    "Buddha",
    "Konghucu",
    "Kristen Advent",
  ];

  const hardcodedGenderOptions = [
    { value: "Male", label: "Male" },
    { value: "Female", label: "Female" },
  ];

  const [isBackPopupOpen, setIsBackPopupOpen] = useState(false);
  const historyRef = useRef(null);
  const studentInfoKeys = useRef(new Set());

  const refreshHistoryDates = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const dates = await getStudentHistoryDates(id);
      setHistoryDates(dates);
    } catch (err) {
      console.error("Failed to refresh history dates:", err);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [id]);

  const [validationMessages, setValidationMessages] = useState({
    nik: "",
    kitas: "",
    nisn: "",
  });

  useEffect(() => {
    if (!location.state?.fromList) {
      navigate("/students", { replace: true });
    }

    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    getRegistrationOptions({})
      .then((data) => {
        setAcademicStatusOptions(
          data.academic_status?.map((opt) => ({ value: opt, label: opt })) || []
        );
        setGenderOptions(hardcodedGenderOptions);
        setStatusOptions(data.active_status || []);
      })
      .catch((err) => console.error("Failed to fetch options:", err));
    // eslint-disable-next-line
  }, []);

  const handleDownloadPdfClick = async () => {
    const applicationId = currentApplicationId;
    const defaultVersionId = studentData?.version_id;
    const versionIdToPrint = selectedVersionId || defaultVersionId;

    if (!applicationId) {
      alert("Application ID tidak ditemukan.");
      return;
    }

    navigate("/print", {
      state: {
        applicationId: applicationId,
        version: versionIdToPrint,
        fromStudentProfile: true,
      },
    });
  };

  const handleFileSelect = (file) => {
    setSelectedPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
    setIsPhotoPopupOpen(false);
  };

  const fetchData = useCallback(
    async (options = {}) => {
      const { isBackgroundRefresh = false } = options;
      try {
        if (!isBackgroundRefresh) {
          setLoading(true);
        }
        const [studentRes, optionsRes] = await Promise.all([
          getStudentLatestApplication(id, "new"),
          getRegistrationOptions(),
        ]);
        setOptions(optionsRes);
        if (studentRes.success) {
          const studentData = studentRes.data;
          const combinedData = {
            student_id: studentData.student_id,
            ...studentData.studentInfo,
            ...studentData.program,
            ...studentData.facilities,
            ...studentData.parentGuardian,
            ...studentData.termOfPayment,
            photo_url: studentData.studentInfo?.photo_url,
          };
          setStudentData(studentData);
          setProfileData(combinedData);
          setFormData(combinedData);
          const studentInfoData = {
            ...(studentData.studentInfo || {}),
            va_mandiri:
              studentData.termOfPayment?.va_mandiri ||
              studentData.studentInfo?.va_mandiri,
            va_bni:
              studentData.termOfPayment?.va_bni ||
              studentData.studentInfo?.va_bni,
            va_bca:
              studentData.termOfPayment?.va_bca ||
              studentData.studentInfo?.va_bca,
            va_bri:
              studentData.termOfPayment?.va_bri ||
              studentData.studentInfo?.va_bri,
          };

          setStudentInfo(studentInfoData);
          studentInfoKeys.current = new Set(Object.keys(studentInfoData));
        }
      } catch (err) {
        console.error("Error fetching student profile data:", err);
      } finally {
        if (!isBackgroundRefresh) {
          setLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setIsBackPopupOpen(true);
    }
  }, [blocker.state]);

  const handleStatusChange = (newStatus) => {
    const inactiveStatuses = ["Graduate", "Expelled", "Withdraw"];
    const newActiveStatus = inactiveStatuses.includes(newStatus) ? "NO" : "YES";
    setStudentInfo((prev) => ({
      ...prev,
      status: newStatus,
      student_active: newActiveStatus,
    }));
  };

  const handleViewHistoryClick = async () => {
    if (selectedVersionId) {
      setSelectedVersionId(null);
      setIsHistoryVisible(false);
      setFormData(profileData);
      setStudentInfo(profileData);
      return;
    }

    const willOpen = !isHistoryVisible;
    setIsHistoryVisible(willOpen);

    if (willOpen) {
      await refreshHistoryDates();
    }
  };

  const handleHistoryDateChange = async (versionId) => {
    if (!versionId) {
      setSelectedVersionId(null);
      setFormData(profileData);
      setStudentInfo(profileData);
      setIsHistoryVisible(false);
      return;
    }

    setSelectedVersionId(versionId);
    setLoading(true);

    try {
      const historyDetail = await getHistoryDetail(id, versionId);
      if (historyDetail.success) {
        const snapshotData = historyDetail.data_snapshot.request_data;
        const studentInfoSnapshot = {
          first_name: snapshotData.first_name,
          middle_name: snapshotData.middle_name,
          last_name: snapshotData.last_name,
          nickname: snapshotData.nickname,
          citizenship: snapshotData.citizenship,
          country: snapshotData.country,
          religion: snapshotData.religion,
          place_of_birth: snapshotData.place_of_birth,
          date_of_birth: snapshotData.date_of_birth,
          email: snapshotData.email,
          phone_number: snapshotData.phone_number,
          previous_school: snapshotData.previous_school,
          academic_status: snapshotData.academic_status,
          academic_status_other: snapshotData.academic_status_other,
          gender: snapshotData.gender,
          family_rank: snapshotData.family_rank,
          nisn: snapshotData.nisn,
          nik: snapshotData.nik,
          kitas: snapshotData.kitas,
          street: snapshotData.street,
          rt: snapshotData.rt,
          rw: snapshotData.rw,
          village: snapshotData.village,
          district: snapshotData.district,
          city_regency: snapshotData.city_regency,
          province: snapshotData.province,
          other: snapshotData.other,
          student_active:
            snapshotData.student_active ?? studentInfo.student_active ?? "YES",
          status: snapshotData.status ?? studentInfo.status ?? "Not Graduated",
          va_mandiri: snapshotData.va_mandiri,
          va_bni: snapshotData.va_bni,
          va_bca: snapshotData.va_bca,
          va_bri: snapshotData.va_bri,
        };

        const combinedData = {
          student_id: historyDetail.student_id,
          ...studentInfoSnapshot,
          section_id: snapshotData.section_id,
          program_id: snapshotData.program_id,
          class_id: snapshotData.class_id,
          major_id: snapshotData.major_id,
          program_other: snapshotData.program_other,
          school_year_id: snapshotData.school_year_id,
          school_year: snapshotData.school_year,
          transportation_id: snapshotData.transportation_id,
          pickup_point_id: snapshotData.pickup_point_id,
          pickup_point_custom: snapshotData.pickup_point_custom,
          transportation_policy: snapshotData.transportation_policy,
          residence_id: snapshotData.residence_id,
          residence_hall_policy: snapshotData.residence_hall_policy,
          father_name: snapshotData.father_name,
          mother_name: snapshotData.mother_name,
          father_company: snapshotData.father_company,
          father_occupation: snapshotData.father_occupation,
          father_phone: snapshotData.father_phone,
          father_email: snapshotData.father_email,
          father_address_street: snapshotData.father_address_street,
          father_address_rt: snapshotData.father_address_rt,
          father_address_rw: snapshotData.father_address_rw,
          father_address_village: snapshotData.father_address_village,
          father_address_district: snapshotData.father_address_district,
          father_address_city_regency: snapshotData.father_address_city_regency,
          father_address_province: snapshotData.father_address_province,
          father_address_other: snapshotData.father_address_other,
          mother_phone: snapshotData.mother_phone,
          mother_email: snapshotData.mother_email,
          mother_address_street: snapshotData.mother_address_street,
          mother_address_rt: snapshotData.mother_address_rt,
          mother_address_rw: snapshotData.mother_address_rw,
          mother_address_village: snapshotData.mother_address_village,
          mother_address_district: snapshotData.mother_address_district,
          mother_address_city_regency: snapshotData.mother_address_city_regency,
          mother_address_province: snapshotData.mother_address_province,
          mother_address_other: snapshotData.mother_address_other,
          guardian_name: snapshotData.guardian_name,
          relation_to_student: snapshotData.relation_to_student,
          guardian_phone: snapshotData.guardian_phone,
          guardian_email: snapshotData.guardian_email,
          guardian_address_street: snapshotData.guardian_address_street,
          guardian_address_rt: snapshotData.guardian_address_rt,
          guardian_address_rw: snapshotData.guardian_address_rw,
          guardian_address_village: snapshotData.guardian_address_village,
          guardian_address_district: snapshotData.guardian_address_district,
          guardian_address_city_regency:
            snapshotData.guardian_address_city_regency,
          guardian_address_province: snapshotData.guardian_address_province,
          guardian_address_other: snapshotData.guardian_address_other,
          tuition_fees: snapshotData.tuition_fees,
          residence_payment: snapshotData.residence_payment,
          financial_policy_contract: snapshotData.financial_policy_contract,
          discount_name: snapshotData.discount_name,
          discount_notes: snapshotData.discount_notes,
          photo_url: snapshotData.photo_url,
        };

        setStudentInfo(studentInfoSnapshot);
        studentInfoKeys.current = new Set(Object.keys(studentInfoSnapshot));
        setFormData(combinedData);
        setIsHistoryVisible(false);
      }
    } catch (error) {
      console.error("Failed to fetch history detail:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearError = (section, fieldName) => {
    if (errors[section] && errors[section][fieldName]) {
      const newSectionErrors = { ...errors[section] };
      delete newSectionErrors[fieldName];
      setErrors((prevErrors) => ({
        ...prevErrors,
        [section]: newSectionErrors,
      }));
    }
  };

  const handleStudentInfoChange = (e) => {
    const { name, value } = e.target;
    clearError("studentInfo", name);

    if (name === "nik" && value && value.length !== 16) {
      setValidationMessages((prev) => ({
        ...prev,
        nik: "NIK must be 16 digits",
      }));
    } else if (name === "nik") {
      setValidationMessages((prev) => ({ ...prev, nik: "" }));
    }

    if (name === "kitas" && value && (value.length < 11 || value.length > 16)) {
      setValidationMessages((prev) => ({
        ...prev,
        kitas: "KITAS must be 11-16 characters",
      }));
    } else if (name === "kitas") {
      setValidationMessages((prev) => ({ ...prev, kitas: "" }));
    }

    if (name === "nisn" && value && value.length !== 10) {
      setValidationMessages((prev) => ({
        ...prev,
        nisn: "NISN must be 10 digits",
      }));
    } else if (name === "nisn") {
      setValidationMessages((prev) => ({ ...prev, nisn: "" }));
    }

    setStudentInfo((prev) => ({ ...prev, [name]: value }));
  };

  const handleStudentInfoSelectChange = (name, selectedOption) => {
    const value = selectedOption ? selectedOption.value : "";
    clearError("studentInfo", name);

    setStudentInfo((prev) => {
      const newData = { ...prev, [name]: value };

      if (name === "citizenship") {
        if (value === "Indonesia") {
          newData.kitas = "";
          newData.country = "";
        } else if (value === "Non Indonesia") newData.nik = "";
      }

      if (name === "academic_status" && value !== "OTHER") {
        newData.academic_status_other = "";
      }

      return newData;
    });
  };

  const handleChange = (e) => {
    // eslint-disable-next-line
    const { name, value, type, checked } = e.target;
    const studentInfoFields = [
      "first_name",
      "nickname",
      "nisn",
      "nik",
      "kitas",
      "gender",
      "family_rank",
      "citizenship",
      "religion",
      "place_of_birth",
      "date_of_birth",
      "email",
      "previous_school",
      "phone_number",
      "academic_status",
      "street",
      "village",
      "district",
      "city_regency",
      "province",
    ];

    const parentFields = [
      "father_name",
      "father_phone",
      "father_email",
      "father_address_street",
      "father_address_village",
      "father_address_district",
      "father_address_city_regency",
      "father_address_province",
      "mother_name",
      "mother_phone",
      "mother_email",
      "mother_address_street",
      "mother_address_village",
      "mother_address_district",
      "mother_address_city_regency",
      "mother_address_province",
    ];

    if (studentInfoFields.includes(name)) {
      clearError("studentInfo", name);
    } else if (parentFields.includes(name)) {
      clearError("parentGuardian", name);
    } else {
      clearError("facilities", name);
    }

    setFormData((prevData) => {
      const newFormData = { ...prevData };
      const radioNames = [
        "section_id",
        "program_id",
        "transportation_id",
        "residence_id",
        "tuition_fees",
        "residence_payment",
      ];
      const isPolicyCheckbox = [
        "transportation_policy",
        "residence_hall_policy",
        "financial_policy_contract",
      ].includes(name);

      newFormData[name] = isPolicyCheckbox
        ? checked
          ? "Signed"
          : "Not Signed"
        : value;

      if (radioNames.includes(name)) {
        newFormData[name] =
          String(prevData[name]) === String(value) ? "" : value;
      } else if (isPolicyCheckbox) {
        newFormData[name] = checked ? "Signed" : "Not Signed";
      } else {
        newFormData[name] = value;
      }

      if (name === "section_id") {
        newFormData.class_id = "";
        newFormData.major_id = "";
      }

      if (name === "class_id") {
        const selectedClass = options.classes.find(
          (c) => String(c.class_id) === String(value)
        );
        const gradeNum = selectedClass ? parseInt(selectedClass.grade, 10) : 0;
        if (gradeNum < 9) {
          newFormData.major_id = "";
        }
      }

      if (name === "transportation_id") {
        const selectedTransport = options.transportations.find(
          (t) => String(t.transport_id) === String(value)
        );
        const transportType = selectedTransport
          ? selectedTransport.type.toLowerCase()
          : "";
        if (transportType === "own car" || transportType === "school bus") {
          const currentResidence = options.residence_halls.find(
            (r) => String(r.residence_id) === String(prevData.residence_id)
          );
          if (
            currentResidence &&
            currentResidence.type.toLowerCase().includes("dormitory")
          ) {
            newFormData.residence_id = "";
          }
        }
      }

      if (name === "discount_name" && !value) {
        newFormData.discount_notes = "";
      }

      return newFormData;
    });
  };

  const handleFormSelectChange = (name, selectedOption) => {
    const value = selectedOption ? selectedOption.value : "";
    setFormData((prevData) => {
      const newFormData = { ...prevData, [name]: value };
      if (name === "discount_name" && !value) {
        newFormData.discount_notes = "";
      }
      if (name === "class_id") {
        if (options?.classes) {
          const selectedClass = options.classes.find(
            (c) => String(c.class_id) === String(value)
          );
          const gradeNum = selectedClass
            ? parseInt(selectedClass.grade, 10)
            : 0;

          if (gradeNum < 9) {
            newFormData.major_id = "";
          }
        }
      }

      return newFormData;
    });
  };

  const handleRadioChange = (name, value) => {
    clearError("facilities", name);
    clearError("termOfPayment", name);

    setFormData((prevData) => {
      const currentVal = prevData[name];
      const newVal = currentVal === value ? "" : value;
      const newFormData = { ...prevData, [name]: newVal };

      if (name === "residence_id") {
        const selectedResidence = options.residence_halls.find(
          (r) => String(r.residence_id) === String(newVal)
        );
        const isDormitory =
          selectedResidence &&
          selectedResidence.type.toLowerCase().includes("dormitory");

        if (isDormitory) {
          newFormData.transportation_id = "";
          newFormData.pickup_point_id = "";
          newFormData.pickup_point_custom = "";
          newFormData.transportation_policy = "Not Signed";
        } else {
          newFormData.residence_payment = null;
        }
      }

      if (name === "transportation_id") {
        const selectedTransport = options.transportations.find(
          (t) => String(t.transport_id) === String(newVal)
        );
        const transportType = selectedTransport
          ? selectedTransport.type.toLowerCase()
          : "";
        if (transportType === "own car" || transportType === "school bus") {
          const currentResidence = options.residence_halls.find(
            (r) => String(r.residence_id) === String(prevData.residence_id)
          );
          if (
            currentResidence &&
            currentResidence.type.toLowerCase().includes("dormitory")
          ) {
            newFormData.residence_id = "";
            newFormData.residence_payment = null;
          }
        }
      }

      return newFormData;
    });
  };

  const handleCancel = () => {
    setFormData(profileData);
    const newStudentInfo = {};
    for (const key of studentInfoKeys.current) {
      newStudentInfo[key] = profileData[key];
    }
    setStudentInfo(newStudentInfo);
    setIsEditing(false);
    setErrors({});
    setValidationMessages({ nik: "", kitas: "", nisn: "" });
    setSelectedPhoto(null);
    setPhotoPreview(null);
  };

  const handleBackClick = () => {
    navigate(-1);
  };

  const handleConfirmBack = () => {
    handleCancel();
    setIsBackPopupOpen(false);
    if (blocker.state === "blocked") {
      blocker.proceed();
    }
  };

  const handleClosePopup = () => {
    setIsBackPopupOpen(false);
    if (blocker.state === "blocked") {
      blocker.reset();
    }
  };

  const validateForm = () => {
    const isFilled = (v) =>
      v !== null && v !== undefined && String(v).trim() !== "";
    const normStr = (v) => String(v ?? "").trim();
    const lower = (v) => normStr(v).toLowerCase();
    const upper = (v) => normStr(v).toUpperCase();
    const toInt = (v) => {
      const n = parseInt(normStr(v), 10);
      return Number.isNaN(n) ? undefined : n;
    };

    const newErrors = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const fullFormData = { ...formData, ...studentInfo };

    const studentInfoErrors = {};
    const requiredStudentFields = {
      first_name: "First name is required",
      nickname: "Nickname is required",
      gender: "Gender is required",
      family_rank: "Rank is required",
      citizenship: "Citizenship is required",
      religion: "Religion is required",
      place_of_birth: "Place of birth is required",
      date_of_birth: "Date of birth is required",
      email: "A valid email is required",
      phone_number: "Phone number is required",
      academic_status: "Academic status is required",
      street: "Street is required",
      village: "Village is required",
      district: "District is required",
      city_regency: "City/Regency is required",
      province: "Province is required",
    };

    for (const field in requiredStudentFields) {
      if (!isFilled(fullFormData[field])) {
        studentInfoErrors[field] = requiredStudentFields[field];
      }
    }

    let selectedSection, selectedClass;
    if (options && fullFormData.section_id && fullFormData.class_id) {
      selectedSection = options.sections?.find(
        (s) => String(s.section_id) === String(fullFormData.section_id)
      );
      selectedClass = options.classes?.find(
        (c) => String(c.class_id) === String(fullFormData.class_id)
      );
    }

    let isPreviousSchoolRequired = true;
    if (selectedSection && selectedClass) {
      const secName = lower(selectedSection.name);
      const gradeStr = upper(selectedClass.grade);
      if (secName === "ecp" && gradeStr === "N") {
        isPreviousSchoolRequired = false;
      }
    }
    if (isPreviousSchoolRequired && !isFilled(fullFormData.previous_school)) {
      studentInfoErrors.previous_school = "Previous school is required.";
    }

    let isNisnRequired = true;
    const classIdNum = toInt(fullFormData.class_id);

    if ([1, 2, 3, 4, 5].includes(classIdNum)) {
      isNisnRequired = false;
    }

    const nisnAsString = normStr(fullFormData.nisn);
    const nikAsString = normStr(fullFormData.nik);
    const kitasAsString = normStr(fullFormData.kitas);

    if (isFilled(nisnAsString)) {
      if (nisnAsString.length !== 10) {
        studentInfoErrors.nisn = "NISN must be 10 digits.";
      } else if (!/^\d+$/.test(nisnAsString)) {
        studentInfoErrors.nisn = "NISN must only contain numbers.";
      }
    } else if (isNisnRequired) {
      studentInfoErrors.nisn = "NISN is required for this grade.";
    }

    if (isFilled(fullFormData.email) && !emailRegex.test(fullFormData.email)) {
      studentInfoErrors.email = "Invalid email format.";
    }

    if (fullFormData.citizenship === "Indonesia") {
      const nikRegex = /^[1-9][0-9]{15}$/;
      if (!isFilled(nikAsString)) {
        studentInfoErrors.nik = "NIK is required.";
      } else if (!nikRegex.test(nikAsString)) {
        studentInfoErrors.nik =
          "NIK must be 16 valid digits (not start with 0).";
      }
    }

    if (fullFormData.citizenship === "Non Indonesia") {
      if (!isFilled(kitasAsString)) {
        studentInfoErrors.kitas = "KITAS is required.";
      } else if (kitasAsString.length < 11 || kitasAsString.length > 16) {
        studentInfoErrors.kitas = "KITAS must be 11-16 characters.";
      }
      if (!isFilled(fullFormData.country)) {
        studentInfoErrors.country = "Country of origin is required.";
      }
    }

    if (
      fullFormData.academic_status === "OTHER" &&
      !isFilled(fullFormData.academic_status_other)
    ) {
      studentInfoErrors.academic_status = "Please specify the academic status.";
    }

    if (Object.keys(studentInfoErrors).length > 0) {
      newErrors.studentInfo = studentInfoErrors;
    }

    const programErrors = {};
    const classIdNum_val = toInt(fullFormData.class_id);

    const needsMajor_val = [12, 13, 14, 15].includes(classIdNum_val);

    if (!isFilled(fullFormData.class_id)) {
      programErrors.class_id = "Grade is required.";
    }

    if (needsMajor_val && !isFilled(fullFormData.major_id)) {
      programErrors.major_id = "Major is required for this grade.";
    }

    if (Object.keys(programErrors).length > 0) {
      newErrors.program = programErrors;
    }

    const facilitiesErrors = {};
    if (!fullFormData.residence_id) {
      facilitiesErrors.residence_id = "Residence Hall is required.";
    }

    if (fullFormData.transportation_id && options?.transportations) {
      const selectedTransport = options.transportations.find(
        (t) => String(t.transport_id) === String(fullFormData.transportation_id)
      );
      if (
        selectedTransport &&
        lower(selectedTransport.type).includes("school bus")
      ) {
        const isPickupPointSelected = !!fullFormData.pickup_point_id;
        const isCustomPickupPointFilled = isFilled(
          fullFormData.pickup_point_custom
        );
        if (!isPickupPointSelected && !isCustomPickupPointFilled) {
          facilitiesErrors.pickup_point_id =
            "Pickup point must be selected or specified.";
        }
      }
    }

    if (
      fullFormData.transportation_id &&
      fullFormData.transportation_policy !== "Signed"
    ) {
      facilitiesErrors.transportation_policy = "Policy must be signed.";
    }

    if (fullFormData.residence_hall_policy !== "Signed") {
      facilitiesErrors.residence_hall_policy = "Policy must be signed.";
    }

    if (Object.keys(facilitiesErrors).length > 0) {
      newErrors.facilities = facilitiesErrors;
    }

    const parentErrors = {};
    if (!isFilled(fullFormData.father_name))
      parentErrors.father_name = "Father's name is required.";
    if (!isFilled(fullFormData.father_phone))
      parentErrors.father_phone = "Father's phone is required.";
    if (
      !isFilled(fullFormData.father_email) ||
      !emailRegex.test(normStr(fullFormData.father_email))
    )
      parentErrors.father_email = "A valid email for the father is required.";
    if (!isFilled(fullFormData.father_address_street))
      parentErrors.father_address_street =
        "Father's street address is required.";
    if (!isFilled(fullFormData.father_address_village))
      parentErrors.father_address_village = "Father's village is required.";
    if (!isFilled(fullFormData.father_address_district))
      parentErrors.father_address_district = "Father's district is required.";
    if (!isFilled(fullFormData.father_address_city_regency))
      parentErrors.father_address_city_regency =
        "Father's city/regency is required.";
    if (!isFilled(fullFormData.father_address_province))
      parentErrors.father_address_province = "Father's province is required.";

    if (!isFilled(fullFormData.mother_name))
      parentErrors.mother_name = "Mother's name is required.";
    if (!isFilled(fullFormData.mother_phone))
      parentErrors.mother_phone = "Mother's phone is required.";
    if (
      !isFilled(fullFormData.mother_email) ||
      !emailRegex.test(normStr(fullFormData.mother_email))
    )
      parentErrors.mother_email = "A valid email for the mother is required.";
    if (!isFilled(fullFormData.mother_address_street))
      parentErrors.mother_address_street =
        "Mother's street address is required.";
    if (!isFilled(fullFormData.mother_address_village))
      parentErrors.mother_address_village = "Mother's village is required.";
    if (!isFilled(fullFormData.mother_address_district))
      parentErrors.mother_address_district = "Mother's district is required.";
    if (!isFilled(fullFormData.mother_address_city_regency))
      parentErrors.mother_address_city_regency =
        "Mother's city/regency is required.";
    if (!isFilled(fullFormData.mother_address_province))
      parentErrors.mother_address_province = "Mother's province is required.";

    if (Object.keys(parentErrors).length > 0) {
      newErrors.parentGuardian = parentErrors;
    }

    const termOfPaymentErrors = {};
    if (!isFilled(fullFormData.tuition_fees)) {
      termOfPaymentErrors.tuition_fees = "Tuition fees are required.";
    }

    if (isDormitorySelected && !isFilled(fullFormData.residence_payment)) {
      termOfPaymentErrors.residence_payment =
        "Residence payment is required for dormitory.";
    }

    if (Object.keys(termOfPaymentErrors).length > 0) {
      newErrors.termOfPayment = termOfPaymentErrors;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  useEffect(() => {
    if (Object.keys(errors).length > 0 && scrollTrigger > 0) {
      const sectionOrder = [
        "studentInfo",
        "program",
        "facilities",
        "parentGuardian",
        "termOfPayment",
      ];
      const firstErrorSectionKey = sectionOrder.find(
        (key) => errors[key] && Object.keys(errors[key]).length > 0
      );

      if (firstErrorSectionKey) {
        const targetId =
          firstErrorSectionKey === "termOfPayment"
            ? "termOfPaymentSection"
            : firstErrorSectionKey;
        const targetElement = document.getElementById(targetId);

        if (targetElement) {
          gsap.to(window, {
            duration: 0.8,
            scrollTo: { y: targetElement, offsetY: 100 },
            ease: "power2.inOut",
          });
        }
      }
    }
    // eslint-disable-next-line
  }, [scrollTrigger]);

  const handleSaveClick = () => {
    const isValid = validateForm();
    if (isValid) {
      setErrors({});
      setFormData((prev) => ({ ...prev, ...studentInfo }));
      setIsPopupOpen(true);
    } else {
      setScrollTrigger((prev) => prev + 1);
    }
  };

  const handleConfirmUpdate = async () => {
    setIsUpdating(true);
    const dataToSend = { ...formData, ...studentInfo };

    if (selectedPhoto) {
      dataToSend.photo = selectedPhoto;
    }

    if (dataToSend.discount_name && options?.discount_types) {
      const val = dataToSend.discount_name;

      const foundDiscount = options.discount_types.find(
        (d) => d.name === val || String(d.discount_type_id) === String(val)
      );

      if (foundDiscount) {
        dataToSend.discount_name = foundDiscount.discount_type_id;
      }
    }

    const classIdNum = parseInt(dataToSend.class_id, 10);
    const needsMajor = [12, 13, 14, 15].includes(classIdNum);

    if (!needsMajor) {
      delete dataToSend.major_id;
    }

    try {
      const response = await updateStudent(id, dataToSend);

      const updatedRequestData = response.data.request_data;
      const serverStudentData = response.data;

      const preservedIdCardInfo = studentData?.idCardInfo || null;

      let finalPhotoUrl = updatedRequestData.photo_url;
      if (finalPhotoUrl && !finalPhotoUrl.includes('api/storage-file')) {
        const pathOnly = finalPhotoUrl.replace(/^.*storage\//, ''); 
        const apiBase = process.env.REACT_APP_API_URL.replace(/\/$/, ''); 
        finalPhotoUrl = `${apiBase}/storage-file/${pathOnly}`;
      }

      if (finalPhotoUrl) {
          const timestamp = new Date().getTime();
          const separator = finalPhotoUrl.includes('?') ? '&' : '?';
          finalPhotoUrl = `${finalPhotoUrl}${separator}t=${timestamp}`;
      }

      const combinedData = {
        ...formData,
        id_primary: response.data.id,
        student_id: response.data.student_id,
        application_id:
          response.data.application_id || studentData.application_id,
        version_id: response.version_id,
        ...updatedRequestData,
        photo_url: finalPhotoUrl,
      };

      setStudentData((prev) => ({
        ...prev,                
        ...serverStudentData,   
        idCardInfo: preservedIdCardInfo, 
        version_id: response.version_id,
      }));
      setProfileData(combinedData);
      setFormData(combinedData);

      const newStudentInfo = {};
      const keysToUpdate = studentInfoKeys.current.size > 0 
        ? studentInfoKeys.current 
        : Object.keys(studentInfo); 
        
      for (const key of keysToUpdate) {
          newStudentInfo[key] = combinedData[key] !== undefined ? combinedData[key] : studentInfo[key];
      }
      newStudentInfo.photo_url = finalPhotoUrl;
      
      setStudentInfo(newStudentInfo);

      setShowSuccess(true);
      setIsEditing(false);
      setIsPopupOpen(false);
      setSelectedPhoto(null);
      setPhotoPreview(null);

      await refreshHistoryDates();
    } catch (error) {
      console.error("Failed to update student:", error);
      
      if (error.response && error.response.data) {
        if (error.response.status === 422 || error.response.data.type === "validation") {
          const serverErrors = error.response.data.errors;
          const formattedErrors = {};

          const studentInfoFields = [
            'first_name', 'middle_name', 'last_name', 'nickname',
            'citizenship', 'country', 'religion', 'place_of_birth',
            'date_of_birth', 'gender', 'family_rank', 'email',
            'phone_number', 'previous_school', 'nisn', 'nik', 'kitas',
            'status', 'street', 'rt', 'rw', 'village', 'district',
            'city_regency', 'province', 'other', 'academic_status'
          ];

          Object.keys(serverErrors).forEach((field) => {
            const message = serverErrors[field][0]; 

            if (studentInfoFields.includes(field)) {
              if (!formattedErrors.studentInfo) formattedErrors.studentInfo = {};
              formattedErrors.studentInfo[field] = message;
            } 
          });

          
          setErrors(formattedErrors); 
          setIsPopupOpen(false); 
          setScrollTrigger((prev) => prev + 1); 
          
        } else {
          console.error("Server Error:", error.response.data);
          alert("An error occurred: " + (error.response.data.message || "Unknown error"));
        }
      } else {
        console.error("Failed to update student:", error);
        alert("Network error or server not responding.");
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const getNameById = (type, id) => {
    if (!options || !id || !options[type] || !options[type].length) return id;
    const keyName = Object.keys(options[type][0])[0];
    const item = options[type]?.find((i) => String(i[keyName]) === String(id));
    return item?.name || item?.grade || item?.type || id;
  };
  // eslint-disable-next-line
  const filteredGrades = useMemo(() => {
    if (!isEditing || !options?.classes || !formData?.section_id) return [];
    const selectedSection = options.sections?.find(
      (sec) => String(sec.section_id) === String(formData.section_id)
    );
    if (!selectedSection) return [];
    const sectionName = selectedSection.name;

    if (sectionName === "ECP") {
      return options.classes.filter((cls) =>
        ["N", "K1", "K2"].includes(cls.grade)
      );
    }
    if (sectionName === "Elementary School") {
      return options.classes.filter((cls) => {
        const grade = parseInt(cls.grade, 10);
        return grade >= 1 && grade <= 6;
      });
    }
    if (sectionName === "Middle School") {
      return options.classes.filter((cls) => {
        const grade = parseInt(cls.grade, 10);
        return grade >= 7 && grade <= 9;
      });
    }
    if (sectionName === "High School") {
      return options.classes.filter((cls) => {
        const grade = parseInt(cls.grade, 10);
        return grade >= 10 && grade <= 12;
      });
    }
    return [];
  }, [isEditing, options, formData?.section_id]);

  const showMajorField = useMemo(() => {
    if (!options?.classes || !formData?.class_id) return false;
    const selectedClass = options.classes.find(
      (c) => String(c.class_id) === String(formData.class_id)
    );
    if (!selectedClass) return false;
    const gradeNum = parseInt(selectedClass.grade, 10);
    return gradeNum >= 9;
  }, [options, formData?.class_id]);

  const filteredResidenceHalls = useMemo(() => {
    if (!options?.residence_halls) return [];
    const selectedTransport = options.transportations?.find(
      (t) => String(t.transport_id) === String(formData?.transportation_id)
    );
    const transportType = selectedTransport
      ? selectedTransport.type.toLowerCase()
      : "";
    const isTransportRestricted =
      transportType === "own car" || transportType === "school bus";

    if (isTransportRestricted) {
      return options.residence_halls.filter(
        (r) => !r.type.toLowerCase().includes("dormitory")
      );
    }
    return options.residence_halls;
  }, [options, formData?.transportation_id]);

  const majorSelectOptions = useMemo(() => {
    if (!options?.majors) return [];
    return options.majors
      .filter((mjr) => mjr.name !== "No Major")
      .map((mjr) => ({
        value: mjr.major_id,
        label: mjr.name,
      }));
  }, [options?.majors]);

  const religionSelectOptions = useMemo(() => {
    return religionOptions.map((opt) => ({
      value: opt,
      label: opt,
    }));
    // eslint-disable-next-line
  }, []);

  const discountSelectOptions = useMemo(() => {
    if (!options?.discount_types) return [];

    return options.discount_types.map((d) => ({
      value: d.discount_type_id,
      label: d.name,
    }));
  }, [options?.discount_types]);

  const classIdRanges = useMemo(
    () => ({
      1: [1, 3], // ECP
      2: [4, 9], // Elementary
      3: [10, 12], // Middle
      4: [13, 15], // High
    }),
    []
  );

  const filteredClassOptions = useMemo(() => {
    if (!options?.classes || !formData?.section_id) return [];

    const range = classIdRanges[String(formData.section_id)];

    if (!range) {
      return [];
    }

    const [min, max] = range;

    return options.classes
      .filter((cls) => {
        const classIdNum = parseInt(cls.class_id, 10);
        return classIdNum >= min && classIdNum <= max;
      })
      .map((cls) => ({
        value: cls.class_id,
        label: cls.grade, 
      }));
  }, [options?.classes, formData?.section_id, classIdRanges]);

  const isDormitorySelected = useMemo(() => {
    if (!options?.residence_halls || !formData?.residence_id) return false;
    const selectedResidence = options.residence_halls.find(
      (r) => String(r.residence_id) === String(formData.residence_id)
    );
    return selectedResidence
      ? selectedResidence.type.toLowerCase().includes("dormitory")
      : false;
  }, [options, formData?.residence_id]);

  if (loading)
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <div>Loading student profile...</div>
      </div>
    );

  if (!formData)
    return <div style={{ padding: "20px" }}>Student not found.</div>;

  const formatDateForInput = (dateString) =>
    !dateString ? "" : new Date(dateString).toISOString().split("T")[0];

  const formatDateForDisplay = (dateString) =>
    !dateString
      ? "-"
      : new Date(dateString).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "long",
          year: "numeric",
        });

  const selectedTransportType =
    options?.transportations?.find(
      (t) => String(t.transport_id) === String(formData.transportation_id)
    )?.type || "";

  const selectedDiscountOption = discountSelectOptions.find(
    (opt) =>
      String(opt.value) === String(formData.discount_name) ||
      opt.label === formData.discount_name
  );

  return (
    <Main showBackButton onBackClick={handleBackClick}>
      <div className={styles.profilePage}>
        <StudentProfileHeader
          studentInfo={studentInfo}
          formData={formData}
          photoPreview={photoPreview}
          isEditing={isEditing}
          isUpdating={isUpdating}
          selectedVersionId={selectedVersionId}
          isHistoryVisible={isHistoryVisible}
          isLoadingHistory={isLoadingHistory}
          historyDates={historyDates}
          historyRef={historyRef}
          onViewHistoryClick={handleViewHistoryClick}
          onHistoryDateChange={handleHistoryDateChange}
          onEditClick={() => setIsEditing(true)}
          onCancelClick={handleCancel}
          onSaveClick={handleSaveClick}
          onAddPhotoClick={() => setIsPhotoPopupOpen(true)}
          statusOptions={statusOptions}
          onStatusChange={handleStatusChange}
          onDownloadPdfClick={handleDownloadPdfClick}
          studentPrimaryId={id}
          idCardInfo={studentData?.idCardInfo}
          onIdCardUpdate={() => fetchData({ isBackgroundRefresh: true })}
        />

        <div className={styles.profileContent}>
          <div className={styles.infoContainer}>
            <div id="studentInfo" className={styles.infoSection}>
              <div
                className={`${styles.sectionHeader} ${
                  isEditing ? styles.sectionHeaderEditing : ""
                }`}
              >
                <b>STUDENT’S INFORMATION</b>
              </div>
              <div className={styles.sectionContent}>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.first_name
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="first_name"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.first_name ? styles.errorLabel : ""
                      }`}
                    >
                      First name
                    </label>
                    {isEditing ? (
                      <input
                        id="first_name"
                        type="text"
                        name="first_name"
                        value={studentInfo.first_name || ""}
                        onChange={handleStudentInfoChange}
                        className={`${styles.formInput} ${
                          errors.studentInfo?.first_name
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.studentInfo?.first_name || "First name"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.first_name || "-"}
                      </b>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="middle_name" className={styles.fieldLabel}>
                      Middle name
                    </label>
                    {isEditing ? (
                      <input
                        id="middle_name"
                        type="text"
                        name="middle_name"
                        value={studentInfo.middle_name || ""}
                        onChange={handleStudentInfoChange}
                        className={styles.formInput}
                        placeholder="Middle name"
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.middle_name || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor="last_name" className={styles.fieldLabel}>
                      Last name
                    </label>
                    {isEditing ? (
                      <input
                        id="last_name"
                        type="text"
                        name="last_name"
                        value={studentInfo.last_name || ""}
                        onChange={handleStudentInfoChange}
                        className={styles.formInput}
                        placeholder="Last name"
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.last_name || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.nickname
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="nickname"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.nickname ? styles.errorLabel : ""
                      }`}
                    >
                      Nickname
                    </label>
                    {isEditing ? (
                      <input
                        id="nickname"
                        type="text"
                        name="nickname"
                        value={studentInfo.nickname || ""}
                        onChange={handleStudentInfoChange}
                        className={`${styles.formInput} ${
                          errors.studentInfo?.nickname ? styles.errorInput : ""
                        }`}
                        placeholder={errors.studentInfo?.nickname || "Nickname"}
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.nickname || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.citizenship
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="citizenship"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.citizenship ? styles.errorLabel : ""
                      }`}
                    >
                      Citizenship
                    </label>
                    {isEditing ? (
                      <div className={styles.selectWrapper}>
                        <Select
                          id="citizenship"
                          name="citizenship"
                          options={citizenshipOptions}
                          value={
                            studentInfo.citizenship
                              ? {
                                  value: studentInfo.citizenship,
                                  label: studentInfo.citizenship,
                                }
                              : null
                          }
                          onChange={(opt) =>
                            handleStudentInfoSelectChange("citizenship", opt)
                          }
                          placeholder={
                            errors.studentInfo?.citizenship ||
                            "Select citizenship"
                          }
                          isClearable
                          classNamePrefix={
                            errors.studentInfo?.citizenship
                              ? "react-select-error"
                              : "react-select"
                          }
                        />
                      </div>
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.citizenship || "-"}
                      </b>
                    )}
                  </div>
                  {studentInfo.citizenship === "Indonesia" && (
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.nik ? styles.errorFieldWrapper : ""
                      }`}
                    >
                      <label
                        htmlFor="nik"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.nik ? styles.errorLabel : ""
                        }`}
                      >
                        NIK
                      </label>
                      {isEditing ? (
                        <div className={styles.inputWithError}>
                          <input
                            id="nik"
                            type="text"
                            name="nik"
                            value={studentInfo.nik || ""}
                            onChange={handleStudentInfoChange}
                            maxLength={16}
                            className={`${styles.formInput} ${
                              errors.studentInfo?.nik || validationMessages.nik
                                ? styles.errorInput
                                : ""
                            }`}
                            placeholder={
                              errors.studentInfo?.nik || "NIK (16 digits)"
                            }
                          />
                          {validationMessages.nik && (
                            <div className={styles.inlineErrorMessageRight}>
                              {validationMessages.nik}
                            </div>
                          )}
                        </div>
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.nik || "-"}
                        </b>
                      )}
                    </div>
                  )}
                  {studentInfo.citizenship === "Non Indonesia" && (
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.kitas
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="kitas"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.kitas ? styles.errorLabel : ""
                        }`}
                      >
                        KITAS
                      </label>
                      {isEditing ? (
                        <div className={styles.inputWithError}>
                          <input
                            id="kitas"
                            type="text"
                            name="kitas"
                            value={studentInfo.kitas || ""}
                            onChange={handleStudentInfoChange}
                            maxLength={16}
                            className={`${styles.formInput} ${
                              errors.studentInfo?.kitas ||
                              validationMessages.kitas
                                ? styles.errorInput
                                : ""
                            }`}
                            placeholder={
                              errors.studentInfo?.kitas ||
                              "KITAS (11-16 characters)"
                            }
                          />
                          {validationMessages.kitas && (
                            <div className={styles.inlineErrorMessageRight}>
                              {validationMessages.kitas}
                            </div>
                          )}
                        </div>
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.kitas || "-"}
                        </b>
                      )}
                    </div>
                  )}
                </div>

                {studentInfo.citizenship === "Non Indonesia" && (
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.country
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="country"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.country ? styles.errorLabel : ""
                        }`}
                      >
                        Country of origin
                      </label>
                      {isEditing ? (
                        <input
                          id="country"
                          type="text"
                          name="country"
                          value={studentInfo.country || ""}
                          onChange={handleStudentInfoChange}
                          className={`${styles.formInput} ${
                            errors.studentInfo?.country ? styles.errorInput : ""
                          }`}
                          placeholder={
                            errors.studentInfo?.country
                              ? errors.studentInfo.country
                              : "Country of origin"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.country || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                )}
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.nisn ? styles.errorFieldWrapper : ""
                    }`}
                  >
                    <label
                      htmlFor="nisn"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.nisn ? styles.errorLabel : ""
                      }`}
                    >
                      NISN
                    </label>
                    {isEditing ? (
                      <div className={styles.inputWithError}>
                        <input
                          id="nisn"
                          type="text"
                          name="nisn"
                          value={studentInfo.nisn || ""}
                          onChange={handleStudentInfoChange}
                          maxLength={10}
                          className={`${styles.formInput} ${
                            errors.studentInfo?.nisn || validationMessages.nisn
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.studentInfo?.nisn || "NISN (10 digits)"
                          }
                        />
                        {validationMessages.nisn && (
                          <div className={styles.inlineErrorMessageRight}>
                            {validationMessages.nisn}
                          </div>
                        )}
                      </div>
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.nisn || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.religion
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="religion"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.religion ? styles.errorLabel : ""
                      }`}
                    >
                      Religion
                    </label>
                    {isEditing ? (
                      <div className={styles.selectWrapper}>
                        <Select
                          id="religion"
                          name="religion"
                          options={religionSelectOptions}
                          value={
                            studentInfo.religion
                              ? {
                                  value: studentInfo.religion,
                                  label: studentInfo.religion,
                                }
                              : null
                          }
                          onChange={(opt) =>
                            handleStudentInfoSelectChange("religion", opt)
                          }
                          placeholder={
                            errors.studentInfo?.religion || "Select religion"
                          }
                          isClearable
                          classNamePrefix={
                            errors.studentInfo?.religion
                              ? "react-select-error"
                              : "react-select"
                          }
                        />
                      </div>
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.religion || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.place_of_birth
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="place_of_birth"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.place_of_birth
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Place of birth
                    </label>
                    {isEditing ? (
                      <input
                        id="place_of_birth"
                        type="text"
                        name="place_of_birth"
                        value={studentInfo.place_of_birth || ""}
                        onChange={handleStudentInfoChange}
                        className={`${styles.formInput} ${
                          errors.studentInfo?.place_of_birth
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.studentInfo?.place_of_birth || "Place of birth"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.place_of_birth || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.date_of_birth
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="date_of_birth"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.date_of_birth
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Date of birth
                    </label>
                    {isEditing ? (
                      <input
                        id="date_of_birth"
                        type="date"
                        name="date_of_birth"
                        value={formatDateForInput(studentInfo.date_of_birth)}
                        onChange={handleStudentInfoChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formatDateForDisplay(studentInfo.date_of_birth)}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.gender ? styles.errorFieldWrapper : ""
                    }`}
                  >
                    <label
                      htmlFor="gender"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.gender ? styles.errorLabel : ""
                      }`}
                    >
                      Gender
                    </label>
                    {isEditing ? (
                      <div className={styles.selectWrapper}>
                        <Select
                          id="gender"
                          name="gender"
                          options={genderOptions}
                          value={
                            studentInfo.gender
                              ? {
                                  value: studentInfo.gender,
                                  label: studentInfo.gender,
                                }
                              : null
                          }
                          onChange={(opt) =>
                            handleStudentInfoSelectChange("gender", opt)
                          }
                          placeholder={
                            errors.studentInfo?.gender || "Select gender"
                          }
                          isClearable
                          classNamePrefix={
                            errors.studentInfo?.gender
                              ? "react-select-error"
                              : "react-select"
                          }
                        />
                      </div>
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.gender || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.family_rank
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="family_rank"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.family_rank ? styles.errorLabel : ""
                      }`}
                    >
                      Rank in the family
                    </label>
                    {isEditing ? (
                      <input
                        id="family_rank"
                        type="number"
                        name="family_rank"
                        value={studentInfo.family_rank || ""}
                        onChange={handleStudentInfoChange}
                        className={`${styles.formInput} ${
                          errors.studentInfo?.family_rank
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={errors.studentInfo?.family_rank || "Rank"}
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.family_rank || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.email ? styles.errorFieldWrapper : ""
                    }`}
                  >
                    <label
                      htmlFor="email"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.email ? styles.errorLabel : ""
                      }`}
                    >
                      Email address
                    </label>
                    {isEditing ? (
                      <input
                        id="email"
                        type="email"
                        name="email"
                        value={studentInfo.email || ""}
                        onChange={handleStudentInfoChange}
                        className={`${styles.formInput} ${
                          errors.studentInfo?.email ? styles.errorInput : ""
                        }`}
                        placeholder={
                          errors.studentInfo?.email || "Email Address"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.email || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.previous_school
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="previous_school"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.previous_school
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Previous School
                    </label>
                    {isEditing ? (
                      <input
                        id="previous_school"
                        type="text"
                        name="previous_school"
                        value={studentInfo.previous_school || ""}
                        onChange={handleStudentInfoChange}
                        className={`${styles.formInput} ${
                          errors.studentInfo?.previous_school
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.studentInfo?.previous_school ||
                          "Previous School"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.previous_school || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.phone_number
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="phone_number"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.phone_number
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Phone number
                    </label>
                    {isEditing ? (
                      <input
                        id="phone_number"
                        type="tel"
                        name="phone_number"
                        value={studentInfo.phone_number || ""}
                        onChange={handleStudentInfoChange}
                        className={`${styles.formInput} ${
                          errors.studentInfo?.phone_number
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.studentInfo?.phone_number || "Phone Number"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.phone_number || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.studentInfo?.academic_status
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="academic_status"
                      className={`${styles.fieldLabel} ${
                        errors.studentInfo?.academic_status
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Academic status
                    </label>
                    {isEditing ? (
                      <div className={styles.academicStatusWrapper}>
                        <div className={styles.selectWrapper}>
                          <Select
                            id="academic_status"
                            name="academic_status"
                            options={academicStatusOptions}
                            value={
                              studentInfo.academic_status
                                ? {
                                    value: studentInfo.academic_status,
                                    label: studentInfo.academic_status,
                                  }
                                : null
                            }
                            onChange={(opt) =>
                              handleStudentInfoSelectChange(
                                "academic_status",
                                opt
                              )
                            }
                            placeholder={
                              errors.studentInfo?.academic_status ||
                              "Select status"
                            }
                            isClearable
                            classNamePrefix={
                              errors.studentInfo?.academic_status
                                ? "react-select-error"
                                : "react-select"
                            }
                          />
                        </div>
                        {studentInfo.academic_status === "OTHER" && (
                          <input
                            type="text"
                            name="academic_status_other"
                            value={studentInfo.academic_status_other || ""}
                            onChange={handleStudentInfoChange}
                            className={`${styles.formInput} ${styles.otherInput}`}
                            placeholder="Please specify"
                          />
                        )}
                      </div>
                    ) : (
                      <b className={styles.fieldValue}>
                        {studentInfo.academic_status_other ||
                          studentInfo.academic_status ||
                          "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.addressGroup}>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.street
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="street"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.street ? styles.errorLabel : ""
                        }`}
                      >
                        Street
                      </label>
                      {isEditing ? (
                        <input
                          id="street"
                          type="text"
                          name="street"
                          value={studentInfo.street || ""}
                          onChange={handleStudentInfoChange}
                          className={`${styles.formInput} ${
                            errors.studentInfo?.street ? styles.errorInput : ""
                          }`}
                          placeholder={errors.studentInfo?.street || "Street"}
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.street || "-"}
                        </b>
                      )}
                    </div>
                    <div className={styles.rtRwGroup}>
                      <div className={styles.field}>
                        <label htmlFor="rt" className={styles.fieldLabel}>
                          RT
                        </label>
                        {isEditing ? (
                          <input
                            id="rt"
                            type="text"
                            name="rt"
                            value={studentInfo.rt || ""}
                            onChange={handleStudentInfoChange}
                            className={styles.formInput}
                            placeholder="RT"
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {studentInfo.rt || "-"}
                          </b>
                        )}
                      </div>
                      <div className={styles.field}>
                        <label htmlFor="rw" className={styles.fieldLabel}>
                          RW
                        </label>
                        {isEditing ? (
                          <input
                            id="rw"
                            type="text"
                            name="rw"
                            value={studentInfo.rw || ""}
                            onChange={handleStudentInfoChange}
                            className={styles.formInput}
                            placeholder="RW"
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {studentInfo.rw || "-"}
                          </b>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.village
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="village"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.village ? styles.errorLabel : ""
                        }`}
                      >
                        Village
                      </label>
                      {isEditing ? (
                        <input
                          id="village"
                          type="text"
                          name="village"
                          value={studentInfo.village || ""}
                          onChange={handleStudentInfoChange}
                          className={`${styles.formInput} ${
                            errors.studentInfo?.village ? styles.errorInput : ""
                          }`}
                          placeholder={errors.studentInfo?.village || "Village"}
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.village || "-"}
                        </b>
                      )}
                    </div>
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.district
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="district"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.district ? styles.errorLabel : ""
                        }`}
                      >
                        District
                      </label>
                      {isEditing ? (
                        <input
                          id="district"
                          type="text"
                          name="district"
                          value={studentInfo.district || ""}
                          onChange={handleStudentInfoChange}
                          className={`${styles.formInput} ${
                            errors.studentInfo?.district
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.studentInfo?.district || "District"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.district || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.city_regency
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="city_regency"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.city_regency
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        City/Regency
                      </label>
                      {isEditing ? (
                        <input
                          id="city_regency"
                          type="text"
                          name="city_regency"
                          value={studentInfo.city_regency || ""}
                          onChange={handleStudentInfoChange}
                          className={`${styles.formInput} ${
                            errors.studentInfo?.city_regency
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.studentInfo?.city_regency || "City/Regency"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.city_regency || "-"}
                        </b>
                      )}
                    </div>
                    <div
                      className={`${styles.field} ${
                        errors.studentInfo?.province
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="province"
                        className={`${styles.fieldLabel} ${
                          errors.studentInfo?.province ? styles.errorLabel : ""
                        }`}
                      >
                        Province
                      </label>
                      {isEditing ? (
                        <input
                          id="province"
                          type="text"
                          name="province"
                          value={studentInfo.province || ""}
                          onChange={handleStudentInfoChange}
                          className={`${styles.formInput} ${
                            errors.studentInfo?.province
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.studentInfo?.province || "Province"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {studentInfo.province || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.otherAddress}>
                    <span className={styles.fieldLabel}>Other: (</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="other"
                        value={studentInfo.other || ""}
                        onChange={handleStudentInfoChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <div
                        className={`${styles.formInput} ${styles.visualInput}`}
                      >
                        {studentInfo.other || "-"}
                      </div>
                    )}
                    <span className={styles.fieldLabel}>)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.infoSection}>
              <div
                className={`${styles.sectionHeader} ${
                  isEditing ? styles.sectionHeaderEditing : ""
                }`}
              >
                <b>PROGRAM</b>
              </div>
              <div className={styles.sectionContent}>
                <div className={styles.optionsRow}>
                  <div className={styles.optionLabel}>Section</div>
                  {options?.sections.map((sec) => (
                    <RadioDisplay
                      key={sec.section_id}
                      label={sec.name}
                      isSelected={
                        String(formData.section_id) === String(sec.section_id)
                      }
                      isEditing={false}
                      name="section_id"
                      value={sec.section_id}
                      onChange={handleRadioChange}
                    />
                  ))}
                </div>
                <div className={styles.optionsRow}>
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>Grade</div>
                    {isEditing ? (
                      <div className={styles.selectWrapper}>
                        <Select
                          id="class_id"
                          name="class_id"
                          options={filteredClassOptions}
                          value={
                            formData.class_id
                              ? filteredClassOptions.find(
                                  (opt) =>
                                    String(opt.value) ===
                                    String(formData.class_id)
                                )
                              : null
                          }
                          onChange={(opt) =>
                            handleFormSelectChange("class_id", opt)
                          }
                          placeholder="Select grade"
                          isClearable
                          classNamePrefix="react-select"
                        />
                      </div>
                    ) : (
                      <b className={styles.fieldValue}>
                        {getNameById("classes", formData.class_id)}
                      </b>
                    )}
                  </div>
                  {showMajorField && (
                    <div className={styles.field}>
                      <div className={styles.fieldLabel}>Major</div>
                      {isEditing ? (
                        <div className={styles.selectWrapper}>
                          <Select
                            id="major_id"
                            name="major_id"
                            options={majorSelectOptions}
                            value={
                              formData.major_id
                                ? majorSelectOptions.find(
                                    (opt) =>
                                      String(opt.value) ===
                                      String(formData.major_id)
                                  )
                                : null
                            }
                            onChange={(opt) =>
                              handleFormSelectChange("major_id", opt)
                            }
                            placeholder="Select major"
                            isClearable
                            classNamePrefix="react-select"
                          />
                        </div>
                      ) : (
                        <b className={styles.fieldValue}>
                          {getNameById("majors", formData.major_id)}
                        </b>
                      )}
                    </div>
                  )}
                </div>

                <div className={styles.optionsRow}>
                  <div className={styles.optionLabel}>Program</div>
                  {options?.programs.map((prog) => (
                    <RadioDisplay
                      key={prog.program_id}
                      label={prog.name}
                      isSelected={
                        String(formData.program_id) === String(prog.program_id)
                      }
                      isEditing={isEditing && prog.name !== "Other"}
                      name="program_id"
                      value={prog.program_id}
                      onChange={handleRadioChange}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div id="facilities" className={styles.infoSection}>
              <div
                className={`${styles.sectionHeader} ${
                  isEditing ? styles.sectionHeaderEditing : ""
                }`}
              >
                <b>FACILITIES</b>
              </div>
              <div className={styles.sectionContent}>
                {!isDormitorySelected && (
                  <>
                    <div className={styles.optionsRow}>
                      <div
                        className={`${styles.optionLabel} ${
                          (errors.facilities?.pickup_point_id &&
                            !formData.pickup_point_id &&
                            !formData.pickup_point_custom) ||
                          (errors.facilities?.transportation_policy &&
                            formData.transportation_policy !== "Signed")
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        Transportation
                      </div>
                      {options?.transportations.map((t) => (
                        <RadioDisplay
                          key={t.transport_id}
                          label={t.type}
                          isSelected={
                            String(formData.transportation_id) ===
                            String(t.transport_id)
                          }
                          isEditing={isEditing}
                          name="transportation_id"
                          value={t.transport_id}
                          onChange={handleRadioChange}
                        />
                      ))}
                    </div>

                    {formData.transportation_id &&
                      selectedTransportType.toLowerCase() !== "own car" && (
                        <>
                          <div className={styles.optionsRow}>
                            <div
                              className={styles.field}
                              style={{ flexGrow: 2 }}
                            >
                              <div className={styles.fieldLabel}>
                                Pickup point
                              </div>
                              {isEditing ? (
                                <select
                                  name="pickup_point_id"
                                  value={formData.pickup_point_id || ""}
                                  onChange={handleChange}
                                  className={styles.formInput}
                                  disabled={!!formData.pickup_point_custom}
                                >
                                  <option value="">Select pickup point</option>
                                  {options?.pickup_points.map((opt) => (
                                    <option
                                      key={opt.pickup_point_id}
                                      value={opt.pickup_point_id}
                                    >
                                      {opt.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <b className={styles.fieldValue}>
                                  {getNameById(
                                    "pickup_points",
                                    formData.pickup_point_id
                                  ) || "-"}
                                </b>
                              )}
                            </div>
                          </div>

                          <div className={styles.optionsRow}>
                            <div
                              className={styles.field}
                              style={{ flexGrow: 2 }}
                            >
                              <div className={styles.fieldLabel}>
                                Custom Pickup point
                              </div>
                              {isEditing ? (
                                <input
                                  type="text"
                                  name="pickup_point_custom"
                                  value={formData.pickup_point_custom || ""}
                                  onChange={handleChange}
                                  className={styles.formInput}
                                  disabled={!!formData.pickup_point_id}
                                  placeholder="Enter custom pickup location"
                                />
                              ) : (
                                <b className={styles.fieldValue}>
                                  {formData.pickup_point_custom || "-"}
                                </b>
                              )}
                            </div>
                          </div>
                        </>
                      )}

                    {errors.facilities?.pickup_point_id &&
                      !formData.pickup_point_id &&
                      !formData.pickup_point_custom && (
                        <div className={styles.inlineErrorMessageFullWidth}>
                          Pickup point must be selected or specified for School
                          Bus.
                        </div>
                      )}

                    <div className={styles.optionsRow}>
                      <div>
                        <CheckboxDisplay
                          label="Transportation Policy"
                          isSelected={
                            formData.transportation_policy === "Signed"
                          }
                          isEditing={isEditing}
                          name="transportation_policy"
                          onChange={handleChange}
                        />
                      </div>

                      {errors.facilities?.transportation_policy &&
                        formData.transportation_policy !== "Signed" && (
                          <div className={styles.inlineErrorMessage}>
                            Policy must be signed.
                          </div>
                        )}
                    </div>
                  </>
                )}

                <div className={styles.optionsRow}>
                  <div
                    className={`${styles.optionLabel} ${
                      (errors.facilities?.residence_id &&
                        !formData.residence_id) ||
                      (errors.facilities?.residence_hall_policy &&
                        formData.residence_hall_policy !== "Signed")
                        ? styles.errorLabel
                        : ""
                    }`}
                  >
                    Residence Hall
                  </div>

                  {filteredResidenceHalls.map((r) => (
                    <RadioDisplay
                      key={r.residence_id}
                      label={r.type}
                      isSelected={
                        String(formData.residence_id) === String(r.residence_id)
                      }
                      isEditing={isEditing}
                      name="residence_id"
                      value={r.residence_id}
                      onChange={handleRadioChange}
                    />
                  ))}
                </div>
                {errors.facilities?.residence_id && (
                  <div className={styles.inlineErrorMessageFullWidth}>
                    {errors.facilities.residence_id}
                  </div>
                )}

                <div className={styles.optionsRow}>
                  <CheckboxDisplay
                    label="Residence Hall Policy"
                    isSelected={formData.residence_hall_policy === "Signed"}
                    isEditing={isEditing}
                    name="residence_hall_policy"
                    onChange={handleChange}
                  />
                  {errors.facilities?.transportation_policy &&
                    formData.transportation_policy !== "Signed" && (
                      <div className={styles.inlineErrorMessage}>
                        Policy must be signed.
                      </div>
                    )}
                </div>
              </div>
            </div>

            <div id="parentGuardian" className={styles.infoSection}>
              <div
                className={`${styles.sectionHeader} ${
                  isEditing ? styles.sectionHeaderEditing : ""
                }`}
              >
                <b>PARENT / GUARDIAN INFORMATION</b>
              </div>
              <div className={styles.sectionContent}>
                <b>Father's Information</b>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.parentGuardian?.father_name
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="father_name"
                      className={`${styles.fieldLabel} ${
                        errors.parentGuardian?.father_name
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Name
                    </label>
                    {isEditing ? (
                      <input
                        id="father_name"
                        type="text"
                        name="father_name"
                        value={formData.father_name || ""}
                        onChange={handleChange}
                        className={`${styles.formInput} ${
                          errors.parentGuardian?.father_name
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.parentGuardian?.father_name
                            ? errors.parentGuardian.father_name
                            : "Father's Name"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.father_name || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label
                      htmlFor="father_company"
                      className={styles.fieldLabel}
                    >
                      Company Name
                    </label>
                    {isEditing ? (
                      <input
                        id="father_company"
                        type="text"
                        name="father_company"
                        value={formData.father_company || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                        placeholder="Company Name"
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.father_company || "-"}
                      </b>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label
                      htmlFor="father_occupation"
                      className={styles.fieldLabel}
                    >
                      Occupation/Position
                    </label>
                    {isEditing ? (
                      <input
                        id="father_occupation"
                        type="text"
                        name="father_occupation"
                        value={formData.father_occupation || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                        placeholder="Occupation/Position"
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.father_occupation || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.parentGuardian?.father_phone
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="father_phone"
                      className={`${styles.fieldLabel} ${
                        errors.parentGuardian?.father_phone
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Phone Number
                    </label>
                    {isEditing ? (
                      <input
                        id="father_phone"
                        type="tel"
                        name="father_phone"
                        value={formData.father_phone || ""}
                        onChange={handleChange}
                        className={`${styles.formInput} ${
                          errors.parentGuardian?.father_phone
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.parentGuardian?.father_phone
                            ? errors.parentGuardian.father_phone
                            : "Phone Number"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.father_phone || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.parentGuardian?.father_email
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="father_email"
                      className={`${styles.fieldLabel} ${
                        errors.parentGuardian?.father_email
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Email
                    </label>
                    {isEditing ? (
                      <input
                        id="father_email"
                        type="email"
                        name="father_email"
                        value={formData.father_email || ""}
                        onChange={handleChange}
                        className={`${styles.formInput} ${
                          errors.parentGuardian?.father_email
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.parentGuardian?.father_email
                            ? errors.parentGuardian.father_email
                            : "Email"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.father_email || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.addressGroup}>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.father_address_street
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="father_address_street"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.father_address_street
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        Street
                      </label>
                      {isEditing ? (
                        <input
                          id="father_address_street"
                          type="text"
                          name="father_address_street"
                          value={formData.father_address_street || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.father_address_street
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.father_address_street
                              ? errors.parentGuardian.father_address_street
                              : "Street"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.father_address_street || "-"}
                        </b>
                      )}
                    </div>
                    <div className={styles.rtRwGroup}>
                      <div className={styles.field}>
                        <label
                          htmlFor="father_address_rt"
                          className={styles.fieldLabel}
                        >
                          RT
                        </label>
                        {isEditing ? (
                          <input
                            id="father_address_rt"
                            type="text"
                            name="father_address_rt"
                            value={formData.father_address_rt || ""}
                            onChange={handleChange}
                            className={styles.formInput}
                            placeholder="RT"
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {formData.father_address_rt || "-"}
                          </b>
                        )}
                      </div>
                      <div className={styles.field}>
                        <label
                          htmlFor="father_address_rw"
                          className={styles.fieldLabel}
                        >
                          RW
                        </label>
                        {isEditing ? (
                          <input
                            id="father_address_rw"
                            type="text"
                            name="father_address_rw"
                            value={formData.father_address_rw || ""}
                            onChange={handleChange}
                            className={styles.formInput}
                            placeholder="RW"
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {formData.father_address_rw || "-"}
                          </b>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.father_address_village
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="father_address_village"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.father_address_village
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        Village
                      </label>
                      {isEditing ? (
                        <input
                          id="father_address_village"
                          type="text"
                          name="father_address_village"
                          value={formData.father_address_village || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.father_address_village
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.father_address_village
                              ? errors.parentGuardian.father_address_village
                              : "Village"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.father_address_village || "-"}
                        </b>
                      )}
                    </div>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.father_address_district
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="father_address_district"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.father_address_district
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        District
                      </label>
                      {isEditing ? (
                        <input
                          id="father_address_district"
                          type="text"
                          name="father_address_district"
                          value={formData.father_address_district || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.father_address_district
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.father_address_district
                              ? errors.parentGuardian.father_address_district
                              : "District"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.father_address_district || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.father_address_city_regency
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="father_address_city_regency"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.father_address_city_regency
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        City/Regency
                      </label>
                      {isEditing ? (
                        <input
                          id="father_address_city_regency"
                          type="text"
                          name="father_address_city_regency"
                          value={formData.father_address_city_regency || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.father_address_city_regency
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.father_address_city_regency
                              ? errors.parentGuardian
                                  .father_address_city_regency
                              : "City/Regency"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.father_address_city_regency || "-"}
                        </b>
                      )}
                    </div>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.father_address_province
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="father_address_province"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.father_address_province
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        Province
                      </label>
                      {isEditing ? (
                        <input
                          id="father_address_province"
                          type="text"
                          name="father_address_province"
                          value={formData.father_address_province || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.father_address_province
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.father_address_province
                              ? errors.parentGuardian.father_address_province
                              : "Province"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.father_address_province || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.otherAddress}>
                    <span className={styles.fieldLabel}>Other: (</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="father_address_other"
                        value={formData.father_address_other || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                        placeholder="Other address details"
                      />
                    ) : (
                      <div
                        className={`${styles.formInput} ${styles.visualInput}`}
                      >
                        {formData.father_address_other || "-"}
                      </div>
                    )}
                    <span className={styles.fieldLabel}>)</span>
                  </div>
                </div>
                <b>Mother's Information</b>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.parentGuardian?.mother_name
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="mother_name"
                      className={`${styles.fieldLabel} ${
                        errors.parentGuardian?.mother_name
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Name
                    </label>
                    {isEditing ? (
                      <input
                        id="mother_name"
                        type="text"
                        name="mother_name"
                        value={formData.mother_name || ""}
                        onChange={handleChange}
                        className={`${styles.formInput} ${
                          errors.parentGuardian?.mother_name
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.parentGuardian?.mother_name
                            ? errors.parentGuardian.mother_name
                            : "Mother's Name"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.mother_name || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label
                      htmlFor="mother_company"
                      className={styles.fieldLabel}
                    >
                      Company Name
                    </label>
                    {isEditing ? (
                      <input
                        id="mother_company"
                        type="text"
                        name="mother_company"
                        value={formData.mother_company || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                        placeholder="Company Name"
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.mother_company || "-"}
                      </b>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label
                      htmlFor="mother_occupation"
                      className={styles.fieldLabel}
                    >
                      Occupation/Position
                    </label>
                    {isEditing ? (
                      <input
                        id="mother_occupation"
                        type="text"
                        name="mother_occupation"
                        value={formData.mother_occupation || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                        placeholder="Occupation/Position"
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.mother_occupation || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div
                    className={`${styles.field} ${
                      errors.parentGuardian?.mother_phone
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="mother_phone"
                      className={`${styles.fieldLabel} ${
                        errors.parentGuardian?.mother_phone
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Phone Number
                    </label>
                    {isEditing ? (
                      <input
                        id="mother_phone"
                        type="tel"
                        name="mother_phone"
                        value={formData.mother_phone || ""}
                        onChange={handleChange}
                        className={`${styles.formInput} ${
                          errors.parentGuardian?.mother_phone
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.parentGuardian?.mother_phone
                            ? errors.parentGuardian.mother_phone
                            : "Phone Number"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.mother_phone || "-"}
                      </b>
                    )}
                  </div>
                  <div
                    className={`${styles.field} ${
                      errors.parentGuardian?.mother_email
                        ? styles.errorFieldWrapper
                        : ""
                    }`}
                  >
                    <label
                      htmlFor="mother_email"
                      className={`${styles.fieldLabel} ${
                        errors.parentGuardian?.mother_email
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Email
                    </label>
                    {isEditing ? (
                      <input
                        id="mother_email"
                        type="email"
                        name="mother_email"
                        value={formData.mother_email || ""}
                        onChange={handleChange}
                        className={`${styles.formInput} ${
                          errors.parentGuardian?.mother_email
                            ? styles.errorInput
                            : ""
                        }`}
                        placeholder={
                          errors.parentGuardian?.mother_email
                            ? errors.parentGuardian.mother_email
                            : "Email"
                        }
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.mother_email || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.addressGroup}>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.mother_address_street
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="mother_address_street"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.mother_address_street
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        Street
                      </label>
                      {isEditing ? (
                        <input
                          id="mother_address_street"
                          type="text"
                          name="mother_address_street"
                          value={formData.mother_address_street || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.mother_address_street
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.mother_address_street
                              ? errors.parentGuardian.mother_address_street
                              : "Street"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.mother_address_street || "-"}
                        </b>
                      )}
                    </div>
                    <div className={styles.rtRwGroup}>
                      <div className={styles.field}>
                        <label
                          htmlFor="mother_address_rt"
                          className={styles.fieldLabel}
                        >
                          RT
                        </label>
                        {isEditing ? (
                          <input
                            id="mother_address_rt"
                            type="text"
                            name="mother_address_rt"
                            value={formData.mother_address_rt || ""}
                            onChange={handleChange}
                            className={styles.formInput}
                            placeholder="RT"
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {formData.mother_address_rt || "-"}
                          </b>
                        )}
                      </div>
                      <div className={styles.field}>
                        <label
                          htmlFor="mother_address_rw"
                          className={styles.fieldLabel}
                        >
                          RW
                        </label>
                        {isEditing ? (
                          <input
                            id="mother_address_rw"
                            type="text"
                            name="mother_address_rw"
                            value={formData.mother_address_rw || ""}
                            onChange={handleChange}
                            className={styles.formInput}
                            placeholder="RW"
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {formData.mother_address_rw || "-"}
                          </b>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.mother_address_village
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="mother_address_village"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.mother_address_village
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        Village
                      </label>
                      {isEditing ? (
                        <input
                          id="mother_address_village"
                          type="text"
                          name="mother_address_village"
                          value={formData.mother_address_village || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.mother_address_village
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.mother_address_village
                              ? errors.parentGuardian.mother_address_village
                              : "Village"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.mother_address_village || "-"}
                        </b>
                      )}
                    </div>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.mother_address_district
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="mother_address_district"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.mother_address_district
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        District
                      </label>
                      {isEditing ? (
                        <input
                          id="mother_address_district"
                          type="text"
                          name="mother_address_district"
                          value={formData.mother_address_district || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.mother_address_district
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.mother_address_district
                              ? errors.parentGuardian.mother_address_district
                              : "District"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.mother_address_district || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.mother_address_city_regency
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="mother_address_city_regency"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.mother_address_city_regency
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        City/Regency
                      </label>
                      {isEditing ? (
                        <input
                          id="mother_address_city_regency"
                          type="text"
                          name="mother_address_city_regency"
                          value={formData.mother_address_city_regency || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.mother_address_city_regency
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.mother_address_city_regency
                              ? errors.parentGuardian
                                  .mother_address_city_regency
                              : "City/Regency"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.mother_address_city_regency || "-"}
                        </b>
                      )}
                    </div>
                    <div
                      className={`${styles.field} ${
                        errors.parentGuardian?.mother_address_province
                          ? styles.errorFieldWrapper
                          : ""
                      }`}
                    >
                      <label
                        htmlFor="mother_address_province"
                        className={`${styles.fieldLabel} ${
                          errors.parentGuardian?.mother_address_province
                            ? styles.errorLabel
                            : ""
                        }`}
                      >
                        Province
                      </label>
                      {isEditing ? (
                        <input
                          id="mother_address_province"
                          type="text"
                          name="mother_address_province"
                          value={formData.mother_address_province || ""}
                          onChange={handleChange}
                          className={`${styles.formInput} ${
                            errors.parentGuardian?.mother_address_province
                              ? styles.errorInput
                              : ""
                          }`}
                          placeholder={
                            errors.parentGuardian?.mother_address_province
                              ? errors.parentGuardian.mother_address_province
                              : "Province"
                          }
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.mother_address_province || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.otherAddress}>
                    <span className={styles.fieldLabel}>Other: (</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="mother_address_other"
                        value={formData.mother_address_other || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <div
                        className={`${styles.formInput} ${styles.visualInput}`}
                      >
                        {formData.mother_address_other || "-"}
                      </div>
                    )}
                    <span className={styles.fieldLabel}>)</span>
                  </div>
                </div>
                <b>Authorized Guardian's Information</b>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>Name</div>
                    {isEditing ? (
                      <input
                        type="text"
                        name="guardian_name"
                        value={formData.guardian_name || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.guardian_name || "-"}
                      </b>
                    )}
                  </div>
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>
                      Relationship to student
                    </div>
                    {isEditing ? (
                      <input
                        type="text"
                        name="relation_to_student"
                        value={formData.relation_to_student || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.relation_to_student || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>Phone Number</div>
                    {isEditing ? (
                      <input
                        type="tel"
                        name="guardian_phone"
                        value={formData.guardian_phone || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.guardian_phone || "-"}
                      </b>
                    )}
                  </div>
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>Email</div>
                    {isEditing ? (
                      <input
                        type="email"
                        name="guardian_email"
                        value={formData.guardian_email || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <b className={styles.fieldValue}>
                        {formData.guardian_email || "-"}
                      </b>
                    )}
                  </div>
                </div>
                <div className={styles.addressGroup}>
                  <div className={styles.row}>
                    <div className={styles.field}>
                      <div className={styles.fieldLabel}>Street</div>
                      {isEditing ? (
                        <input
                          type="text"
                          name="guardian_address_street"
                          value={formData.guardian_address_street || ""}
                          onChange={handleChange}
                          className={styles.formInput}
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.guardian_address_street || "-"}
                        </b>
                      )}
                    </div>
                    <div className={styles.rtRwGroup}>
                      <div className={styles.field}>
                        <div className={styles.fieldLabel}>RT</div>
                        {isEditing ? (
                          <input
                            type="text"
                            name="guardian_address_rt"
                            value={formData.guardian_address_rt || ""}
                            onChange={handleChange}
                            className={styles.formInput}
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {formData.guardian_address_rt || "-"}
                          </b>
                        )}
                      </div>
                      <div className={styles.field}>
                        <div className={styles.fieldLabel}>RW</div>
                        {isEditing ? (
                          <input
                            type="text"
                            name="guardian_address_rw"
                            value={formData.guardian_address_rw || ""}
                            onChange={handleChange}
                            className={styles.formInput}
                          />
                        ) : (
                          <b className={styles.fieldValue}>
                            {formData.guardian_address_rw || "-"}
                          </b>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.field}>
                      <div className={styles.fieldLabel}>Village</div>
                      {isEditing ? (
                        <input
                          type="text"
                          name="guardian_address_village"
                          value={formData.guardian_address_village || ""}
                          onChange={handleChange}
                          className={styles.formInput}
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.guardian_address_village || "-"}
                        </b>
                      )}
                    </div>
                    <div className={styles.field}>
                      <div className={styles.fieldLabel}>District</div>
                      {isEditing ? (
                        <input
                          type="text"
                          name="guardian_address_district"
                          value={formData.guardian_address_district || ""}
                          onChange={handleChange}
                          className={styles.formInput}
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.guardian_address_district || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.field}>
                      <div className={styles.fieldLabel}>City/Regency</div>
                      {isEditing ? (
                        <input
                          type="text"
                          name="guardian_address_city_regency"
                          value={formData.guardian_address_city_regency || ""}
                          onChange={handleChange}
                          className={styles.formInput}
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.guardian_address_city_regency || "-"}
                        </b>
                      )}
                    </div>
                    <div className={styles.field}>
                      <div className={styles.fieldLabel}>Province</div>
                      {isEditing ? (
                        <input
                          type="text"
                          name="guardian_address_province"
                          value={formData.guardian_address_province || ""}
                          onChange={handleChange}
                          className={styles.formInput}
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.guardian_address_province || "-"}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className={styles.otherAddress}>
                    <span className={styles.fieldLabel}>Other: (</span>
                    {isEditing ? (
                      <input
                        type="text"
                        name="guardian_address_other"
                        value={formData.guardian_address_other || ""}
                        onChange={handleChange}
                        className={styles.formInput}
                      />
                    ) : (
                      <div
                        className={`${styles.formInput} ${styles.visualInput}`}
                      >
                        {formData.guardian_address_other || "-"}
                      </div>
                    )}
                    <span className={styles.fieldLabel}>)</span>
                  </div>
                </div>
              </div>
            </div>

            <div id="termOfPaymentSection" className={styles.infoSection}>
              <div
                className={`${styles.sectionHeader} ${
                  isEditing ? styles.sectionHeaderEditing : ""
                } ${
                  errors.termOfPayment &&
                  (errors.termOfPayment.tuition_fees ||
                    errors.termOfPayment.residence_payment)
                    ? styles.sectionHeaderError
                    : ""
                }`}
              >
                <b>TERM OF PAYMENT</b>
              </div>
              <div className={styles.paymentContentWrapper}>
                <div className={styles.paymentSection}>
                  <div
                    className={`${styles.paymentTitle} ${
                      errors.termOfPayment?.tuition_fees
                        ? styles.errorLabel
                        : ""
                    }`}
                  >
                    Tuition Fee
                  </div>
                  <div className={styles.paymentOptionGroup}>
                    {options?.tuition_fees?.map((option) => (
                      <RadioDisplay
                        key={option}
                        label={option}
                        isSelected={formData.tuition_fees === option}
                        isEditing={isEditing}
                        name="tuition_fees"
                        value={option}
                        onChange={handleRadioChange}
                      />
                    ))}
                  </div>
                </div>

                {isDormitorySelected && (
                  <div className={styles.paymentSection}>
                    <div
                      className={`${styles.paymentTitle} ${
                        errors.termOfPayment?.residence_payment
                          ? styles.errorLabel
                          : ""
                      }`}
                    >
                      Residence Hall
                    </div>
                    <div className={styles.paymentOptionGroup}>
                      {options?.residence_payment?.map((option) => (
                        <RadioDisplay
                          key={option}
                          label={option}
                          isSelected={formData.residence_payment === option}
                          isEditing={isEditing}
                          name="residence_payment"
                          value={option}
                          onChange={handleRadioChange}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className={styles.paymentSection}>
                  <div className={styles.paymentTitle}>
                    Financial Policy & Contract
                  </div>
                  <div className={styles.paymentOptionGroup}>
                    <CheckboxDisplay
                      label="Agree"
                      isSelected={
                        formData.financial_policy_contract === "Signed"
                      }
                      isEditing={isEditing}
                      name="financial_policy_contract"
                      onChange={handleChange}
                    />
                  </div>
                </div>
              </div>
              <div className={styles.discountSection}>
                <div className={styles.paymentTitle}>Discount</div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <div className={styles.fieldLabel}>Discount</div>
                    {isEditing ? (
                      <div className={styles.selectWrapper}>
                        <Select
                          id="discount_name"
                          name="discount_name"
                          options={discountSelectOptions}
                          value={selectedDiscountOption || null}
                          onChange={(opt) =>
                            handleFormSelectChange("discount_name", opt)
                          }
                          placeholder="Select discount (if any)"
                          isClearable
                          classNamePrefix="react-select"
                          menuPortalTarget={document.body}
                        />
                      </div>
                    ) : (
                      <b className={styles.fieldValue}>
                        {selectedDiscountOption
                          ? selectedDiscountOption.label
                          : "-"}
                      </b>
                    )}
                  </div>

                  {(isEditing || formData.discount_name) && (
                    <div className={styles.field}>
                      <div className={styles.fieldLabel}>Notes</div>
                      {isEditing ? (
                        <input
                          id="discount_notes"
                          type="text"
                          name="discount_notes"
                          value={formData.discount_notes || ""}
                          onChange={handleChange}
                          className={styles.formInput}
                          placeholder="Discount notes"
                          disabled={!formData.discount_name} 
                        />
                      ) : (
                        <b className={styles.fieldValue}>
                          {formData.discount_notes || "-"}
                        </b>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="va_mandiri" className={styles.fieldLabel}>
                    Virtual Account Mandiri
                  </label>
                  {isEditing ? (
                    <input
                      id="va_mandiri"
                      type="text"
                      name="va_mandiri"
                      value={studentInfo.va_mandiri || ""}
                      onChange={handleStudentInfoChange}
                      className={styles.formInput}
                      placeholder="Enter VA number"
                    />
                  ) : (
                    <b className={styles.fieldValue}>
                      {studentInfo.va_mandiri || "-"}
                    </b>
                  )}
                </div>
                <div className={styles.field}>
                  <label htmlFor="va_bni" className={styles.fieldLabel}>
                    Virtual Account BNI
                  </label>
                  {isEditing ? (
                    <input
                      id="va_bni"
                      type="text"
                      name="va_bni"
                      value={studentInfo.va_bni || ""}
                      onChange={handleStudentInfoChange}
                      className={styles.formInput}
                      placeholder="Enter VA number"
                    />
                  ) : (
                    <b className={styles.fieldValue}>
                      {studentInfo.va_bni || "-"}
                    </b>
                  )}
                </div>
              </div>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="va_bca" className={styles.fieldLabel}>
                    Virtual Account BCA
                  </label>
                  {isEditing ? (
                    <input
                      id="va_bca"
                      type="text"
                      name="va_bca"
                      value={studentInfo.va_bca || ""}
                      onChange={handleStudentInfoChange}
                      className={styles.formInput}
                      placeholder="Enter VA number"
                    />
                  ) : (
                    <b className={styles.fieldValue}>
                      {studentInfo.va_bca || "-"}
                    </b>
                  )}
                </div>
                <div className={styles.field}>
                  <label htmlFor="va_bri" className={styles.fieldLabel}>
                    Virtual Account BRI
                  </label>
                  {isEditing ? (
                    <input
                      id="va_bri"
                      type="text"
                      name="va_bri"
                      value={studentInfo.va_bri || ""}
                      onChange={handleStudentInfoChange}
                      className={styles.formInput}
                      placeholder="Enter VA number"
                    />
                  ) : (
                    <b className={styles.fieldValue}>
                      {studentInfo.va_bri || "-"}
                    </b>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
        <ConfirmUpdatePopup
          isOpen={isPopupOpen}
          onClose={() => setIsPopupOpen(false)}
          onConfirm={handleConfirmUpdate}
          isUpdating={isUpdating}
        />

        <UpdatedNotification
          isOpen={showSuccess}
          onClose={() => setShowSuccess(false)}
        />

        <PhotoUploadPopup
          isOpen={isPhotoPopupOpen}
          onClose={() => setIsPhotoPopupOpen(false)}
          onFileSelect={handleFileSelect}
        />
      </div>
      <ConfirmBackPopup
        isOpen={isBackPopupOpen}
        onClose={handleClosePopup}
        onConfirm={handleConfirmBack}
      />
    </Main>
  );
};

export default StudentProfile;
