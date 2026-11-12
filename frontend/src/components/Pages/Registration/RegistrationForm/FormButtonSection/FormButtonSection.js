import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import PopUpConfirm from "../../../../Molecules/PopUp/PopUpConfirm/PopUpConfirm";
import styles from "./FormButtonSection.module.css";
import DuplicateStudentPopup from "../PopUp/DuplicateStudentPopup";
import Button from "../../../../Atoms/Button/Button";

const FormButtonSection = ({
  validationState,
  onSetErrors,
  draftId,
  allFormData,
  onReset,
  location,
  sharedData,
  onSetAllowNavigation,
}) => {
  const navigate = useNavigate();
  // eslint-disable-next-line
  const locationState = useLocation();
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showDuplicatePopup, setShowDuplicatePopup] = useState(false);

  const handleReset = () => {
    if (onReset) onReset();
  };

  const handleSubmit = () => {

    const errors = {};
    const emailRegex =
      /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/;
    const studentStatus = allFormData.studentStatus || {};
    if (!studentStatus.student_status) {
      errors.studentStatus = { ...errors.studentStatus, student_status: true };
    } else if (
      studentStatus.student_status === "Old" &&
      !studentStatus.is_selected
    ) {
      errors.studentStatus = { ...errors.studentStatus, input_name: true };
    }

    const studentInfo = allFormData.studentInfo || {};
    if (!studentInfo.first_name) {
      errors.studentInfo = { ...errors.studentInfo, first_name: true };
    }
    if (!studentInfo.nickname) {
      errors.studentInfo = { ...errors.studentInfo, nickname: true };
    }

    let isNisnRequired = true;
    const sectionId = allFormData.program?.section_id;
    const classId = allFormData.program?.class_id;
    if (sharedData && sectionId && classId) {
      const selectedSection = sharedData.sections?.find(
        (s) => s.section_id === sectionId
      );
      const selectedClass = sharedData.classes?.find(
        (c) => c.class_id === classId
      );
      if (selectedSection) {
        if (
          selectedSection.name === "ECP" ||
          (selectedSection.name === "Elementary School" &&
            selectedClass &&
            ["1", "2"].includes(selectedClass.grade))
        ) {
          isNisnRequired = false;
        }
      }
    }

    let isPreviousSchoolRequired = true;

    if (sharedData && sectionId && classId) {
      const selectedSection = sharedData.sections?.find(
        (s) => s.section_id === sectionId
      );
      const selectedClass = sharedData.classes?.find(
        (c) => c.class_id === classId
      );

      if (selectedSection && selectedClass) {
        if (selectedSection.name === "ECP" && selectedClass.grade === "N") {
          isPreviousSchoolRequired = false;
        }
      }
    }

    if (
      isPreviousSchoolRequired &&
      !String(studentInfo.previous_school || "").trim()
    ) {
      errors.studentInfo = { ...errors.studentInfo, previous_school: true };
    }

    const nisnAsString = String(studentInfo.nisn || "").trim();
    if (
      isNisnRequired &&
      (!nisnAsString ||
        nisnAsString.length !== 10 ||
        !/^\d+$/.test(nisnAsString))
    ) {
      errors.studentInfo = { ...errors.studentInfo, nisn: true };
    } else if (
      !isNisnRequired &&
      nisnAsString &&
      (nisnAsString.length !== 10 || !/^\d+$/.test(nisnAsString))
    ) {
      errors.studentInfo = { ...errors.studentInfo, nisn: true };
    }

    const nikAsString = String(studentInfo.nik || "").trim();
    if (studentInfo.citizenship === "Indonesia") {
      const nikRegex = /^[1-9][0-9]{15}$/;
      if (!nikRegex.test(nikAsString)) {
        errors.studentInfo = { ...errors.studentInfo, nik: true };
      }
    }

    const kitasAsString = String(studentInfo.kitas || "").trim();
    if (studentInfo.citizenship === "Non Indonesia") {
      if (
        !kitasAsString ||
        kitasAsString.length < 11 ||
        kitasAsString.length > 51
      ) {
        errors.studentInfo = { ...errors.studentInfo, kitas: true };
      }
    }

    const countryAsString = String(studentInfo.country || "").trim();
    if (studentInfo.citizenship === "Non Indonesia") {
      if (!countryAsString) {
        errors.studentInfo = { ...errors.studentInfo, country: true };
      }
    }

    if (!studentInfo.gender) {
      errors.studentInfo = { ...errors.studentInfo, gender: true };
    }
    if (!studentInfo.family_rank) {
      errors.studentInfo = { ...errors.studentInfo, family_rank: true };
    }
    if (
      studentInfo.citizenship === undefined ||
      studentInfo.citizenship === null
    ) {
      errors.studentInfo = { ...errors.studentInfo, citizenship: true };
    }
    if (!studentInfo.religion) {
      errors.studentInfo = { ...errors.studentInfo, religion: true };
    }
    if (!studentInfo.place_of_birth) {
      errors.studentInfo = { ...errors.studentInfo, place_of_birth: true };
    }
    if (!studentInfo.date_of_birth) {
      errors.studentInfo = { ...errors.studentInfo, date_of_birth: true };
    }
    if (!studentInfo.email || !emailRegex.test(studentInfo.email)) {
      errors.studentInfo = { ...errors.studentInfo, email: true };
    }
    if (!studentInfo.phone_number) {
      errors.studentInfo = { ...errors.studentInfo, phone_number: true };
    }
    if (!studentInfo.academic_status) {
      errors.studentInfo = { ...errors.studentInfo, academic_status: true };
    }
    if (!studentInfo.street) {
      errors.studentInfo = { ...errors.studentInfo, street: true };
    }
    if (!studentInfo.village) {
      errors.studentInfo = { ...errors.studentInfo, village: true };
    }
    if (!studentInfo.district) {
      errors.studentInfo = { ...errors.studentInfo, district: true };
    }
    if (!studentInfo.city_regency) {
      errors.studentInfo = { ...errors.studentInfo, city_regency: true };
    }
    if (!studentInfo.province) {
      errors.studentInfo = { ...errors.studentInfo, province: true };
    }

    // Validasi Program Section
    const program = allFormData.program || {};
    if (!program.section_id) {
      errors.program = { ...errors.program, section_id: true };
    }
    if (!program.program_id && !program.program_other) {
      errors.program = { ...errors.program, program_id: true };
    }
    if (program.program_id === null && !program.program_other) {
      errors.program = { ...errors.program, program_other: true };
    }
    if (!program.class_id) {
      errors.program = { ...errors.program, class_id: true };
    }
    const needsMajor = [12, 13, 14, 15].includes(program.class_id);
    if (needsMajor && !program.major_id) {
      errors.program = { ...errors.program, major_id: true };
    }

    // Validasi Facilities Section
    const facilities = allFormData.facilities || {};
    if (!facilities.residence_id) {
      errors.facilities = { ...errors.facilities, residence_id: true };
    }
    if (
      facilities.transportation_id &&
      facilities.transportation_policy !== "Signed"
    ) {
      errors.facilities = { ...errors.facilities, transportation_policy: true };
    }
    if (facilities.residence_hall_policy !== "Signed") {
      errors.facilities = { ...errors.facilities, residence_hall_policy: true };
    }
    if (sharedData && facilities.transportation_id) {
      const selectedTransportation = sharedData.transportations?.find(
        (t) => t.transport_id === facilities.transportation_id
      );
      if (
        selectedTransportation &&
        selectedTransportation.type.toLowerCase().includes("school bus")
      ) {
        const pickupPointFilled = facilities.pickup_point_id;
        const customPickupPointFilled =
          facilities.pickup_point_custom &&
          facilities.pickup_point_custom.trim() !== "";
        if (!pickupPointFilled && !customPickupPointFilled) {
          errors.facilities = { ...errors.facilities, pickup_point_id: true };
        }
      }
    }

    // Validasi Parent Guardian Section
    const parentGuardian = allFormData.parentGuardian || {};
    if (!parentGuardian.father_name) {
      errors.parentGuardian = { ...errors.parentGuardian, father_name: true };
    }
    if (!parentGuardian.father_phone) {
      errors.parentGuardian = { ...errors.parentGuardian, father_phone: true };
    }
    if (
      !parentGuardian.father_email ||
      !emailRegex.test(parentGuardian.father_email)
    ) {
      errors.parentGuardian = { ...errors.parentGuardian, father_email: true };
    }
    if (!parentGuardian.father_address_street) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        father_address_street: true,
      };
    }
    if (!parentGuardian.father_address_village) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        father_address_village: true,
      };
    }
    if (!parentGuardian.father_address_district) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        father_address_district: true,
      };
    }
    if (!parentGuardian.father_address_city_regency) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        father_address_city_regency: true,
      };
    }
    if (!parentGuardian.father_address_province) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        father_address_province: true,
      };
    }

    if (!parentGuardian.mother_name) {
      errors.parentGuardian = { ...errors.parentGuardian, mother_name: true };
    }
    if (!parentGuardian.mother_phone) {
      errors.parentGuardian = { ...errors.parentGuardian, mother_phone: true };
    }
    if (
      !parentGuardian.mother_email ||
      !emailRegex.test(parentGuardian.mother_email)
    ) {
      errors.parentGuardian = { ...errors.parentGuardian, mother_email: true };
    }
    if (!parentGuardian.mother_address_street) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        mother_address_street: true,
      };
    }
    if (!parentGuardian.mother_address_village) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        mother_address_village: true,
      };
    }
    if (!parentGuardian.mother_address_district) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        mother_address_district: true,
      };
    }
    if (!parentGuardian.mother_address_city_regency) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        mother_address_city_regency: true,
      };
    }
    if (!parentGuardian.mother_address_province) {
      errors.parentGuardian = {
        ...errors.parentGuardian,
        mother_address_province: true,
      };
    }

    // Validasi Term of Payment Section
    let isDormitoryStudent = false;
    if (sharedData && sharedData.residence_halls && facilities.residence_id) {
      const selectedResidence = sharedData.residence_halls.find(
        (r) => r.residence_id === facilities.residence_id
      );
      if (
        selectedResidence &&
        selectedResidence.type.toLowerCase().includes("dormitory")
      ) {
        isDormitoryStudent = true;
      }
    }

    // Validasi Term of Payment Section
    const termOfPayment = allFormData.termOfPayment || {};
    if (!termOfPayment.tuition_fees) {
      errors.termOfPayment = { ...errors.termOfPayment, tuition_fees: true };
    }

    if (isDormitoryStudent && !termOfPayment.residence_payment) {
      errors.termOfPayment = {
        ...errors.termOfPayment,
        residence_payment: true,
      };
    }

    const hasErrors = Object.values(errors).some(
      (sectionErrors) => sectionErrors && Object.keys(sectionErrors).length > 0
    );

    if (hasErrors) {
      if (onSetErrors) {
        onSetErrors(errors);
      }
      return;
    }

    setShowConfirmation(true);
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
  };

  const handleConfirmSubmit = () => {
    setShowConfirmation(false);
  };

  const handleDuplicateFound = () => {
    setShowConfirmation(false);

    setShowDuplicatePopup(true);
  };

  return (
    <div className={styles.container}>
      <div className={styles.noteSection}>
        <div className={styles.noteLabel}>Note: </div>
        <div className={styles.noteText}>
          <span className={styles.noteContent}>
            Please make sure all the data below are accurate before pressing{" "}
          </span>
          <b>Done</b>
        </div>
        <div className={styles.noteText}>
          <span className={styles.noteContent}>
            Please keep in mind that this action cannot be{" "}
          </span>
          <b>undone</b>
          <span className={styles.noteContent}>.</span>
        </div>
      </div>
      <div className={styles.buttonSection}>
        <Button
          className={styles.resetButton}
          onClick={handleReset}
          variant="outline"
          type="button"
        >
          Reset
        </Button>
        <Button
          className={styles.submitButton}
          onClick={handleSubmit}
          variant="solid"
          type="button"
        >
          Submit
        </Button>
      </div>

      {showConfirmation && (
        <PopUpConfirm
          onCancel={handleCancelConfirmation}
          onConfirm={handleConfirmSubmit}
          draftId={draftId}
          allFormData={allFormData}
          locationState={location}
          navigate={navigate}
          onDuplicateFound={handleDuplicateFound}
          onSetAllowNavigation={onSetAllowNavigation}
          onSetErrors={onSetErrors} 
        />
      )}
      {showDuplicatePopup && (
        <DuplicateStudentPopup onClose={() => setShowDuplicatePopup(false)} />
      )}
    </div>
  );
};

export default FormButtonSection;
