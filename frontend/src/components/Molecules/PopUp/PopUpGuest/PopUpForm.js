import React, { useState, useRef, useEffect } from "react";
import ReactDOM from "react-dom";
import styles from "./PopUpForm.module.css";
import Button from "../../../Atoms/Button/Button";
import { getOptions } from "../../../../utils/masterData";
import Select from "react-select";
import ConfirmBackPopup from "../../../Molecules/PopUp/PopUpBackConfirm/PopUpBackConfirm";

const PopUpForm = ({ onClose, onSubmit, initialData }) => {
  const isEditMode = !!initialData;
  const initialRef = useRef(null);
  const formRef = useRef();
  const [loading, setLoading] = useState(false);
  const [isBackPopupOpen, setIsBackPopupOpen] = useState(false);

  const [visitors, setVisitors] = useState([
    { id: Date.now(), name: "", relation: "" }
  ]);
  const [students, setStudents] = useState([
    { id: Date.now(), name: "", class_id: "", previous_school: "" }
  ]);
  const getNow = () => {
    const d = new Date();

    const pad = (n) => String(n).padStart(2, "0");

    const year = d.getFullYear();
    const month = pad(d.getMonth() + 1);
    const date = pad(d.getDate());
    const hours = pad(d.getHours());
    const minutes = pad(d.getMinutes());

    return `${year}-${month}-${date}T${hours}:${minutes}`;
  };
  const [form, setForm] = useState({
    date_visit: getNow(),
    address: "",
    contact: "",
    remarks: "",
  });
  const [gradeOptions, setGradeOptions] = useState([]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const opts = await getOptions();

        const mappedGrades = (opts.classes || []).map((c) => ({
          value: c.class_id,
          label: c.grade,
        }));

        setGradeOptions(mappedGrades);
      } catch (err) {
        console.error("Failed to fetch grade options", err);
      }
    };

    fetchOptions();
  }, []);

  // Load Edit
  useEffect(() => {
    if (!initialData || gradeOptions.length === 0) return;

    // Map visitors
    const initialVisitors = initialData.visitors?.length
      ? initialData.visitors.map(v => ({
          id: Date.now() + Math.random(),
          name: v.name || "",
          relation: v.relation || ""
        }))
      : [{ name: "", relation: "" }];

    // Map students & match gradeOptions
    const initialStudents = initialData.students?.length
      ? initialData.students.map((s) => ({
          id: Date.now() + Math.random(),
          name: s.name || "",
          class_id: s.class_id || "",
          previous_school: s.previous_school || "",
        }))
      : [{ id: Date.now(), name: "", class_id: "", previous_school: "" }];

    // Map form fields
    const formatDateTimeLocal = (datetime) => {
      if (!datetime) return "";
      return datetime.replace(" ", "T").slice(0, 16);
    };

    const initialForm = {
      date_visit: formatDateTimeLocal(initialData.date_visit),
      address: initialData.address || "",
      contact: initialData.contact || "",
      remarks: initialData.remarks || "",
    };

    // Set state
    setVisitors(initialVisitors);
    setStudents(initialStudents);
    setForm(initialForm);

    // Save snapshot for isDirty comparison
    initialRef.current = {
      visitors: JSON.parse(JSON.stringify(initialVisitors)),
      students: JSON.parse(JSON.stringify(initialStudents)),
      form: { ...initialForm },
    };
  }, [initialData, gradeOptions]);

  //===================HANDLER======================
  //===================HANDLER visitor======================
  const handleVisitorChange = (index, key, value) => {
    const updated = [...visitors];
    updated[index][key] = value;
    setVisitors(updated);
  };

  const addVisitor = () => {
    setVisitors((prev) => [
      ...prev,
      { id: Date.now(), name: "", relation: "" }
    ]);
  };

  const removeVisitor = (index) => {
    setVisitors((prev) => prev.filter((_, i) => i !== index));
  };
  
  //===================HANDLER students======================
  const handleStudentChange = (index, key, value) => {
    const updated = [...students];
    updated[index][key] = value;
    setStudents(updated);
  };

  const addStudent = () => {
    setStudents((prev) => [
      ...prev,
      { id: Date.now(), name: "", class_id: "", previous_school: "" }
    ]);
  };

  const removeStudent = (index) => {
    setStudents((prev) => prev.filter((_, i) => i !== index));
  };

  //===================HANDLER main======================
  //change
  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  //cancel button
  const isDirty = (() => {
    if (!isEditMode) {
      // ADD mode → cek kalau ada isi
      return (
        visitors.some((v) => v.name || v.relation) ||
        students.some((s) => s.name || s.class_id || s.previous_school) ||
        form.address ||
        form.contact ||
        form.remarks
      );
    }

    // EDIT mode → cek perubahan dibanding snapshot
    const current = { visitors, students, form };
    const initial = initialRef.current || { visitors: [], students: [], form: {} };

    return JSON.stringify(current) !== JSON.stringify(initial);
  })();

  const handleCancelClick = () => {
    if (!isDirty) return onClose();
    setIsBackPopupOpen(true);
  };
  const handleClosePopup = () => {
    setIsBackPopupOpen(false);
  };
  const handleConfirmBack = () => {
    setIsBackPopupOpen(false);
    onClose();
  };

  //submit button
  const handleSubmit = async (e) => {
    e.preventDefault();

    // VALIDATION
    if (!visitors.length) return alert("At least 1 visitor required");
    if (!students.length) return alert("At least 1 student required");

    if (!form.date_visit) {
      return alert("Date visit is required");
    }

    if (!form.address) {
      return alert("Address is required");
    }

    if (!form.contact) {
      return alert("Contact is required");
    }

    const invalidVisitor = visitors.some((v) => !v.name?.trim());
    if (invalidVisitor) {
      return alert("All visitor names are required");
    }

    const isInvalid = students.some((s) => !s.name?.trim() || !s.class_id);
    if (isInvalid) {
      return alert("All student name and grade are required");
    }

    if (loading) return;
    setLoading(true);

    try {
      const formattedDate = form.date_visit.replace("T", " ") + ":00";
      await onSubmit({
        ...(initialData?.id && { id: initialData.id }),
        ...form,
        date_visit: formattedDate,
        visitors: visitors.map(v => ({
          ...v,
          name: v.name.trim(),
          relation: v.relation?.trim(),
        })),
        students: students.map(s => ({
          ...s,
          name: s.name.trim(),
          previous_school: s.previous_school?.trim(),
        })),
      });

      onClose();
    } catch (err) {

      if (err.response?.data?.errors) {
        alert(JSON.stringify(err.response.data.errors, null, 2));
      } else {
        alert(err.response?.data?.message || "Failed to save guest");
      }
    } finally {
      setLoading(false);
    }
  };

  const RequiredLabel = ({ children }) => (
    <span>
      {children} <span style={{ color: "red" }}>*</span>
    </span>
  );

  //===================UI======================
  return ReactDOM.createPortal(
    <div className={styles.overlay}>
      <form
        className={styles.popUpForm}
        onSubmit={handleSubmit}
        ref={formRef}
        autoComplete="off"
      >
        <div className={styles.createNewRegistration}>
          {isEditMode ? "Edit Guest" : "Add New Guest"}
        </div>

        <div className={styles.frameParent}>
          <div className={styles.fieldWrapper}>
            <label className={styles.label}>
              <RequiredLabel>Date Visit</RequiredLabel>
            </label>
            <input
              type="datetime-local"
              className={styles.textInput}
              value={form.date_visit}
              onChange={(e) => handleChange("date_visit", e.target.value)}
              required
            />
          </div>
          
          <div className={styles.fieldWrapper}>
            <label className={styles.label}>
              <RequiredLabel>Visitor</RequiredLabel>
            </label>

            {visitors.map((v, idx) => (
              <div key={v.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  className={styles.textInput}
                  type="text"
                  placeholder="Visitor Name"
                  value={v.name || ""}
                  onChange={(e) =>
                    handleVisitorChange(idx, "name", e.target.value)
                  }
                  style={{ flex: 2, minWidth: 180 }}
                  required
                />

                <input
                  className={styles.textInput}
                  type="text"
                  placeholder="Relation (Father, Mother...)"
                  value={v.relation || ""}
                  onChange={(e) =>
                    handleVisitorChange(idx, "relation", e.target.value)
                  }
                  style={{ flex: 1, minWidth: 140 }}
                />

                {visitors.length > 1 && (
                  <button type="button" onClick={() => removeVisitor(idx)}>
                    ✕
                  </button>
                )}
              </div>
            ))}

            <button type="button" onClick={addVisitor}>
              + Add Visitor
            </button>
          </div>

          <div className={styles.fieldWrapper}>
            <label className={styles.label}>
              <RequiredLabel>Student</RequiredLabel>
            </label>

            {students.map((s, idx) => (
              <div key={s.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  className={styles.textInput}
                  type="text"
                  placeholder="Student Name"
                  value={s.name || ""}
                  onChange={(e) =>
                    handleStudentChange(idx, "name", e.target.value)
                  }
                  required
                />
                <input
                  className={styles.textInput}
                  type="text"
                  placeholder="Previous School"
                  value={s.previous_school || ""}
                  onChange={(e) =>
                    handleStudentChange(idx, "previous_school", e.target.value)
                  }
                />

                <div className={styles.gradeField}>
                  <Select
                    options={gradeOptions}
                    placeholder="Select Grade *"
                    value={
                      s.class_id
                        ? gradeOptions.find((opt) => opt.value === s.class_id)
                        : null
                    }
                    onChange={(selected) =>
                      handleStudentChange(idx, "class_id", selected?.value ?? "")
                    }
                    isClearable
                    classNamePrefix="react-select"
                    styles={{
                      control: (base) => ({
                        ...base,
                        border: 0,
                        boxShadow: "none",
                        backgroundColor: "transparent",
                        minWidth: "140px",
                      }),
                    }}
                    required
                  />
                </div>

                {students.length > 1 && (
                  <button type="button" onClick={() => removeStudent(idx)}>
                    ✕
                  </button>
                )}
              </div>
            ))}

            <button type="button" onClick={addStudent}>
              + Add Student
            </button>
          </div>

          <div className={styles.fieldWrapper}>
            <label className={styles.label}>
              <RequiredLabel>Address</RequiredLabel>
            </label>
            <input
              className={styles.textInput}
              type="text"
              placeholder="Address"
              value={form.address || ""}
              onChange={(e) => handleChange("address", e.target.value)} required 
            />
          </div>

          <div className={styles.fieldWrapper}>
            <label className={styles.label}>
              <RequiredLabel>Telp / Email</RequiredLabel>
            </label>
            <input
              className={styles.textInput}
              type="text"
              placeholder="Telp / Email"
              value={form.contact || ""}
              onChange={(e) => handleChange("contact", e.target.value)} required 
            />
          </div>

          <div className={styles.fieldWrapper}>
            <label className={styles.label}>Remarks / Notes</label>
            <input
              className={styles.textInput}
              type="text"
              placeholder="Remarks / Notes"
              value={form.remarks || ""}
              onChange={(e) => handleChange("remarks", e.target.value)}
            />
          </div>
        </div>

        <div className={styles.bAddSubjectParent}>
          <Button type="button" onClick={handleCancelClick} variant="outline">
            Cancel
          </Button>

          <Button
            type="submit"
            variant="solid"
            disabled={loading || students.some(s => !s.name?.trim() || !s.class_id)}
            className={loading ? styles.loadingButton : ""}
          >
            {loading
              ? "Processing..."
              : isEditMode
              ? "Update"
              : "Create"}
          </Button>
        </div>
      </form>
      <ConfirmBackPopup
        isOpen={isBackPopupOpen}
        onClose={handleClosePopup}
        onConfirm={handleConfirmBack}
      />
    </div>,
    document.body
  );
};

export default PopUpForm;