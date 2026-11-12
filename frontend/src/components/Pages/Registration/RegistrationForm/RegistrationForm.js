// eslint-disable-next-line
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate, useBlocker } from "react-router-dom";
import Main from "../../../Layout/Main";
import StudentStatusSection from "./StudentStatus/StudentStatusSection";
import StudentInformationSection from "./StudentInformation/StudentInformationSection";
import ProgramSection from "./Program/ProgramSection";
import FacilitiesSection from "./Facilities/FacilitiesSection";
import ParentGuardianSection from "./ParentGuardian/ParentGuardianSection";
import TermOfPaymentSection from "./TermOfPayment/TermOfPaymentSection";
import OtherDetailSection from "./OtherDetail/OtherDetailSection";
import FormButtonSection from "./FormButtonSection/FormButtonSection";
import ConfirmBackPopup from "../../../Molecules/PopUp/PopUpBackConfirm/PopUpBackConfirm";
import styles from "./RegistrationForm.module.css";
import { getRegistrationOptions } from "../../../../services/api";
import { gsap } from "gsap";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";

gsap.registerPlugin(ScrollToPlugin);

const RegistrationForm = () => {
  const location = useLocation();
  // eslint-disable-next-line
  const [prefilledData, setPrefilledData] = useState({});
  const formData = location.state || {};
  const [formSections, setFormSections] = useState({
    studentStatus: {},
    studentInfo: {},
    program: {},
    facilities: {},
    parentGuardian: {},
    termOfPayment: {},
    otherDetail: {}, 
  });
  const [resetKey, setResetKey] = useState(0);
  // eslint-disable-next-line
  const [prefillTrigger, setPrefillTrigger] = useState(0);
  const [sharedData, setSharedData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [validationState, setValidationState] = useState({});
  const [errors, setErrors] = useState({});
  const [forceError, setForceError] = useState({});
  const [allowNavigation, setAllowNavigation] = useState(false);
  const blocker = useBlocker(!allowNavigation);

  const [isBackPopupOpen, setIsBackPopupOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const s = location.state || {};
    const isValid = s.fromPopup && s.draftId && s.schoolYear && s.semester;

    if (!isValid) {
      navigate("/Registration", { replace: true });
    }
  }, [location.state, navigate]);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);

    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const data = await getRegistrationOptions();
        setSharedData(data);
        setIsLoading(false);
      } catch (error) {
        console.error("Failed to fetch registration options:", error);
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    const sectionOrder = [
      "studentStatus",
      "studentInfo",
      "program",
      "facilities",
      "parentGuardian",
      "termOfPayment",
      "otherDetail", 
    ];

    const firstErrorSection = sectionOrder.find(
      (sectionName) =>
        errors[sectionName] && Object.keys(errors[sectionName]).length > 0
    );

    if (firstErrorSection) {
      const targetId =
        errors[firstErrorSection]._firstError || firstErrorSection;
      const targetElement = document.getElementById(targetId);

      if (targetElement) {
        gsap.to(window, {
          duration: 0.8,
          scrollTo: {
            y: targetElement,
            offsetY: 100,
          },
          ease: "power2.inOut",
        });
      }
    }
  }, [errors]);

  const handleSectionDataChange = useCallback((sectionName, data) => {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      console.error(`Data untuk ${sectionName} harus berupa objek`, data);
      return;
    }

    setFormSections((prev) => {
      const currentSection = prev[sectionName] || {};
      const newSection = { ...currentSection, ...data };
      if (JSON.stringify(currentSection) === JSON.stringify(newSection)) {
        return prev;
      }

      return {
        ...prev,
        [sectionName]: newSection,
      };
    });
  }, []);

  const handleStudentStatusDataChange = useCallback(
    (data) => {
      handleSectionDataChange("studentStatus", data);
    },
    [handleSectionDataChange]
  );

  const handleStudentInfoDataChange = useCallback(
    (data) => {
      handleSectionDataChange("studentInfo", data);
    },
    [handleSectionDataChange]
  );

  const handleStudentInfoValidationChange = useCallback((validationData) => {
    handleValidationChange("studentInfo", validationData); // eslint-disable-next-line
  }, []);

  const handleProgramDataChange = useCallback(
    (data) => {
      handleSectionDataChange("program", data);
    },
    [handleSectionDataChange]
  );

  const handleFacilitiesDataChange = useCallback(
    (data) => {
      handleSectionDataChange("facilities", data);
    },
    [handleSectionDataChange]
  );

  const handleParentGuardianDataChange = useCallback(
    (data) => {
      handleSectionDataChange("parentGuardian", data);
    },
    [handleSectionDataChange]
  );

  const handleTermOfPaymentDataChange = useCallback(
    (data) => {
      handleSectionDataChange("termOfPayment", data);
    },
    [handleSectionDataChange]
  );


  const handleOtherDetailDataChange = useCallback(
    (data) => {
      handleSectionDataChange("otherDetail", data);
    },
    [handleSectionDataChange]
  );

  const handleSelectOldStudent = (latestData) => {

    if (latestData) {
      if (
        latestData.studentInfo &&
        Object.keys(latestData.studentInfo).length > 0
      ) {
        handleSectionDataChange("studentInfo", latestData.studentInfo);
      }

      if (latestData.program && Object.keys(latestData.program).length > 0) {
        handleSectionDataChange("program", latestData.program);
      }

      if (
        latestData.facilities &&
        Object.keys(latestData.facilities).length > 0
      ) {
        handleSectionDataChange("facilities", latestData.facilities);
      }

      if (
        latestData.parentGuardian &&
        Object.keys(latestData.parentGuardian).length > 0
      ) {
        handleSectionDataChange("parentGuardian", latestData.parentGuardian);
      }

      const termOfPaymentData = { ...(latestData.termOfPayment || {}) };

      if (latestData.studentInfo) {
        termOfPaymentData.va_mandiri = latestData.studentInfo.va_mandiri;
        termOfPaymentData.va_bca = latestData.studentInfo.va_bca;
        termOfPaymentData.va_bni = latestData.studentInfo.va_bni;
        termOfPaymentData.va_bri = latestData.studentInfo.va_bri;
      }

      if (Object.keys(termOfPaymentData).length > 0) {
        handleSectionDataChange("termOfPayment", termOfPaymentData);
      }
    }

    setPrefillTrigger((prev) => prev + 1);
  };

  const handleClearFormOnStatusChange = useCallback(() => {
    setFormSections((prev) => ({
      ...prev,
      studentInfo: {},
      program: {},
      facilities: {},
      parentGuardian: {},
      termOfPayment: {},
      otherDetail: {},
    }));

    setPrefilledData({});
    setErrors({});
    setForceError({});

    setResetKey((prevKey) => prevKey + 1);
  }, []);

  const handleValidationChange = useCallback((sectionName, validationData) => {
    setValidationState((prev) => ({
      ...prev,
      [sectionName]: validationData,
    }));
  }, []);

  const handleSetErrors = useCallback((allNewErrors) => {
    setErrors(allNewErrors);
    setForceError(allNewErrors);
  }, []);

  const handleResetForm = () => {
    setFormSections({
      studentStatus: {},
      studentInfo: {},
      program: {},
      facilities: {},
      parentGuardian: {},
      termOfPayment: {},
      otherDetail: {},
    });

    setPrefilledData({});
    setValidationState({});
    setErrors({});
    setForceError({});

    setResetKey((prevKey) => prevKey + 1);

    window.scrollTo(0, 0);
  };

  const getDisplayValues = useCallback(() => {
    if (!sharedData || !formData.schoolYear || !formData.semester) {
      return { schoolYearDisplay: "", semesterDisplay: "" };
    }

    const schoolYear = sharedData.school_years?.find(
      (sy) => sy.school_year_id.toString() === formData.schoolYear.toString()
    );

    const semester = sharedData.semesters?.find(
      (s) => s.semester_id.toString() === formData.semester.toString()
    );

    return {
      schoolYearDisplay: schoolYear?.year || formData.schoolYear,
      semesterDisplay: semester?.number || formData.semester,
    };
  }, [sharedData, formData.schoolYear, formData.semester]);

  useEffect(() => {
    if (blocker.state === "blocked") {
      setIsBackPopupOpen(true);
    }
  }, [blocker.state]);

  const handleBackClick = () => {
    navigate("/Registration", { replace: true }); 
  };

  const handleConfirmBack = () => {
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

  const resId = formSections?.facilities?.residence_id;
  let isDormitoryStudent = false;
  if (resId && sharedData?.residence_halls) {
    const selectedResidence = sharedData.residence_halls.find(
      (r) => String(r.residence_id) === String(resId)
    );
    isDormitoryStudent = selectedResidence
      ? selectedResidence.type.toLowerCase().includes("dormitory")
      : false;
  }

  if (isLoading) {
    return (
      <Main>
        <div className={styles.loading}>
          <div className={styles.spinner}></div>
          <div>Loading registration form...</div>
        </div>
      </Main>
    );
  }

  const draftId = formData.draftId;
  const { schoolYearDisplay, semesterDisplay } = getDisplayValues();

  return (
    <Main showBackButton onBackClick={handleBackClick}>
      <div className={styles.formContainer}>
        {formData.schoolYear && (
          <div className={styles.formInfo}>
            <p>
              <strong>School Year:</strong> {schoolYearDisplay}
            </p>
            <p>
              <strong>Semester:</strong> {semesterDisplay}
            </p>
            <p>
              <strong>Date:</strong> {formatDate(formData.date)}
            </p>
          </div>
        )}

        <FormButtonSection
          validationState={validationState}
          onSetErrors={handleSetErrors}
          draftId={draftId}
          allFormData={formSections}
          onReset={handleResetForm}
          location={location}
          sharedData={sharedData}
          onSetAllowNavigation={setAllowNavigation}
        />

        <div id="studentStatus">
          <StudentStatusSection
            onSelectOldStudent={handleSelectOldStudent}
            onDataChange={handleStudentStatusDataChange}
            sharedData={sharedData}
            errors={errors.studentStatus || {}}
            forceError={forceError.studentStatus || {}}
            onClearForm={handleClearFormOnStatusChange}
          />
        </div>
        <div id="studentInfo">
          <StudentInformationSection
            key={resetKey}
            prefill={formSections.studentInfo || {}}
            onValidationChange={handleStudentInfoValidationChange}
            onDataChange={handleStudentInfoDataChange}
            errors={errors.studentInfo || {}}
            forceError={forceError.studentInfo || {}}
            sharedData={sharedData}
          />
        </div>
        <div id="program">
          <ProgramSection
            key={resetKey}
            prefill={formSections.program || {}}
            onDataChange={handleProgramDataChange}
            sharedData={sharedData}
            errors={errors.program || {}}
            forceError={forceError.program || {}}
          />
        </div>
        <div id="facilities">
          <FacilitiesSection
            key={resetKey}
            prefill={formSections.facilities || {}}
            onDataChange={handleFacilitiesDataChange}
            sharedData={sharedData}
            errors={errors.facilities || {}}
            forceError={forceError.facilities || {}}
          />
        </div>
        <div id="parentGuardian">
          <ParentGuardianSection
            key={resetKey}
            formData={formSections.parentGuardian || {}}
            onDataChange={handleParentGuardianDataChange}
            errors={errors.parentGuardian || {}}
            forceError={forceError.parentGuardian || {}}
          />
        </div>
        <div id="termOfPayment">
          <TermOfPaymentSection
            key={resetKey}
            prefill={formSections.termOfPayment || {}}
            onDataChange={handleTermOfPaymentDataChange}
            sharedData={sharedData}
            errors={errors.termOfPayment || {}}
            forceError={forceError.termOfPayment || {}}
            isDormitory={isDormitoryStudent}
          />
        </div>

        <div id="otherDetail">
          <OtherDetailSection
            key={resetKey}
            prefill={formSections.otherDetail || {}}
            onDataChange={handleOtherDetailDataChange}
            errors={errors.otherDetail || {}}
            forceError={forceError.otherDetail || {}}
          />
        </div>
      </div>
      <ConfirmBackPopup
        isOpen={isBackPopupOpen}
        onClose={handleClosePopup}
        onConfirm={handleConfirmBack}
      />
    </Main>
  );
};

export default RegistrationForm;