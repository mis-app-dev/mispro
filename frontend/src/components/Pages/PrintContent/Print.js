import React, { useRef, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import styles from "./Print.module.css";
import kop from "../../../assets/LogoMIS_Print.png";
import footer from "../../../assets/Footer_A4.svg";
import footerF4Logos from "../../../assets/Footer_F4.svg";
import switchIcon from "../../../assets/switch_icon.svg";
import StudentsInformationContent from "./StudentsInformationContent/StudentsInformationContent";
import ProgramContent from "./ProgramContent/ProgramContent";
import FacilitiesContent from "./FacilitiesContent/FacilitiesContent";
import ParentsGuardianInformationContent from "./ParentsGuardianInformationContent/ParentsGuardianInformationContent";
import TermOfPaymentContent from "./TermOfPaymentContent/TermOfPaymentContent";
import PledgeContent from "./PledgeContent/PledgeContent";
import SignatureContent from "./SignatureContent/SignatureContent";
import OtherDetailContent from "./OtherDetailContent/OtherDetailContent";
import {
  getRegistrationPreview,
  getRegistrationOptions,
} from "../../../services/api";
import Button from "../../Atoms/Button/Button";

function Print() {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    applicationId,
    version,
    fromSubmission,
    fromStudentProfile,
    otherDetail,
  } = location.state || {};

  const printRef = useRef();
  const [previewData, setPreviewData] = useState(null);
  const [sectionOptions, setSectionOptions] = useState([]);
  const [programOptions, setProgramOptions] = useState([]);
  const [pickupPointOptions, setPickupPointOptions] = useState([]);
  const [classOptions, setClassOptions] = useState([]);
  const [majorOptions, setMajorOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isPrinting, setIsPrinting] = useState(false);
  const [pageSize, setPageSize] = useState("A4");

  const [residenceHallOptions, setResidenceHallOptions] = useState([]);

  useEffect(() => {
    if (!applicationId) {
      navigate("/Registration", { replace: true });
    }
  }, [applicationId, navigate]);

  const handleBackButtonClick = () => {
    if (fromStudentProfile) {
      navigate("/students");
    } else if (fromSubmission) {
      navigate("/Registration", { replace: true });
    } else {
      navigate(-1);
    }
  };

  const backButtonText = fromStudentProfile
    ? "Back to Student List"
    : "Back to Registration";

  const downloadPDF = async () => {
    if (!printRef.current || !previewData?.student_id) return;

    setIsPrinting(true);
    try {
      const element = printRef.current;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        ignoreElements: (el) => el.classList.contains("no-print"),
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.85);

      const isA4 = pageSize === "A4";
      const pdfWidth = 210;
      const pdfHeight = isA4 ? 297 : 330;

      const pdf = new jsPDF("p", "mm", [pdfWidth, pdfHeight]);

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const canvasRatio = canvasHeight / canvasWidth;
      const pdfRatio = pdfHeight / pdfWidth;

      let imgWidthOnPdf, imgHeightOnPdf;

      if (canvasRatio > pdfRatio) {
        imgHeightOnPdf = pdfHeight;
        imgWidthOnPdf = canvasWidth * (pdfHeight / canvasHeight);
      } else {
        imgWidthOnPdf = pdfWidth;
        imgHeightOnPdf = canvasHeight * (pdfWidth / canvasHeight);
      }

      const x = (pdfWidth - imgWidthOnPdf) / 2;
      const y = 0;

      pdf.addImage(
        imgData,
        "JPEG",
        x,
        y,
        imgWidthOnPdf,
        imgHeightOnPdf,
        undefined,
        "FAST"
      );

      const studentName =
        `${previewData.request_data.first_name} ${previewData.request_data.last_name}`.replace(
          /[\\?%*:|"<>]/g,
          "-"
        );

      pdf.save(`${studentName}_Application_Form (${pageSize}).pdf`);
    } catch (error) {
      console.error("Failed to generate PDF:", error);
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const [previewResp, optionsResp] = await Promise.all([
          getRegistrationPreview(applicationId, version),
          getRegistrationOptions(),
        ]);

        const apiData = previewResp.data;

        if (otherDetail && apiData && apiData.request_data) {
          apiData.request_data = {
            ...apiData.request_data,
            ...otherDetail,
          };
        }
        const discountList = optionsResp.discount_types || [];

        if (apiData && apiData.request_data && discountList.length > 0) {
          const discountId = apiData.request_data.discount_name;

          if (discountId) {
            const foundDiscount = discountList.find(
              (d) => String(d.discount_type_id) === String(discountId)
            );

            if (foundDiscount) {
              apiData.request_data.discount_name = foundDiscount.name;
            }
          }
        }

        setPreviewData(apiData);
        setSectionOptions(optionsResp.sections || []);
        setProgramOptions(optionsResp.programs || []);
        setPickupPointOptions(optionsResp.pickup_points || []);
        setClassOptions(optionsResp.classes || []);
        setMajorOptions(optionsResp.majors || []);
        setResidenceHallOptions(optionsResp.residence_halls || []);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (applicationId) {
      fetchAllData();
    } else {
      console.error("No applicationId provided in navigation state");
      setLoading(false);
    }
  }, [applicationId, version, otherDetail]);

  if (loading)
    return (
      <div className={styles.loading}>
        <div className={styles.spinner}></div>
        <div>Loading preview...</div>
      </div>
    );

  if (!applicationId)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "18px",
          fontWeight: "bold",
        }}
      >
        No application ID found
      </div>
    );

  if (!previewData)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          fontSize: "18px",
          fontWeight: "bold",
        }}
      >
        No preview data found
      </div>
    );
  // eslint-disable-next-line
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const options = { day: "numeric", month: "long", year: "numeric" };
    return new Intl.DateTimeFormat("en-GB", options).format(date);
  };

  const getSemesterNumber = (semester) => {
    if (!semester) return "";
    return semester.includes("1") ? "1 (One)" : "2 (Two)";
  };

  const handlePageSizeToggle = () => {
    setPageSize((prevSize) => (prevSize === "A4" ? "F4" : "A4"));
  };

  const isDormitorySelected = (() => {
    const resId = previewData?.request_data?.residence_id;
    if (!resId || !residenceHallOptions?.length) return false;
    const item = residenceHallOptions.find(
      (r) => String(r.residence_id) === String(resId)
    );
    const label = (item?.type || item?.name || "").toLowerCase().trim();
    const hasNon = /\bnon\b/.test(label) || label.includes("non-res");
    const isDorm =
      /\bdormitory\b/.test(label) ||
      /\bboys?\b/.test(label) ||
      /\bgirls?\b/.test(label);

    return !hasNon && isDorm;
  })();

  return (
    <div className={styles.printWrapper}>
      <div className={`no-print ${styles.printActionsBar}`}>
        <h3>Page Format {pageSize}</h3>
        <img
          src={switchIcon}
          alt="Switch View"
          className={styles.switchIcon}
          title="Switch View"
          onClick={handlePageSizeToggle}
        />
        <Button onClick={handleBackButtonClick} variant="outline">
          {backButtonText}
        </Button>
        <Button onClick={downloadPDF} disabled={isPrinting} variant="solid">
          {isPrinting ? "Generating PDF..." : "Export as PDF"}
        </Button>
      </div>

      <div
        ref={printRef}
        className={pageSize === "A4" ? styles.printPageA4 : styles.printPageF4}
      >
        <div className={styles.header}>
          <div className={styles.headerRow}>
            <img src={kop} alt="Header KOP" className={styles.headerKop} />
            <div className={styles.schoolInfo}>
              <div className={styles.schoolName}>
                <b>MANADO INDEPENDENT SCHOOL</b>
              </div>
              <div className={styles.schoolAddress}>
                Jl. Walanda Maramis, Kolongan, North Minahasa 95371, North
                Sulawesi, Indonesia.
              </div>
              <div className={styles.schoolAddress}>
                PO BOX 1627 Manado 95016. Telp: +62 (431) 892-252, 893-300; Fax
                +62 (431) 892-678
              </div>
              <div className={styles.schoolAddress}>
                Website: www.mis-mdo.sch.id; Email: info@mis-mdo.sch.id
              </div>
            </div>
          </div>
          <div className={styles.title}>
            <b className={styles.applicationForm}>APPLICATION FORM</b>
          </div>
          <div className={styles.formInfo}>
            <div className={styles.semesterParent}>
              <b className={styles.infoTitle}>Semester:</b>
              <b className={styles.infoTitle}>
                {getSemesterNumber(previewData.semester ?? "")}
              </b>
            </div>
            <div className={styles.semesterChild}>
              <b className={styles.infoTitle}>School Year:</b>
              <b className={styles.infoTitle}>
                {previewData.school_year ?? ""}
              </b>
            </div>
            <div className={styles.semesterChild}>
              <b className={styles.infoTitle}>Registration Number:</b>
              <b className={styles.infoTitle}>
                {previewData.registration_number ?? ""}
              </b>
            </div>
            <div className={styles.registrationIdParent}>
              <b className={styles.infoTitle}>Registration ID: </b>
              <b className={styles.infoTitle}>
                {previewData.registration_id ?? ""}
              </b>
            </div>
          </div>
        </div>
        <div className={styles.form}>
          <div className={styles.studentsInformation}>
            <div className={styles.header1}>
              <b className={styles.titleHeader}>STUDENT'S INFORMATION</b>
            </div>
            <StudentsInformationContent data={previewData} />
          </div>
          <div className={styles.program}>
            <div className={styles.header1}>
              <b className={styles.titleHeader}>PROGRAM</b>
            </div>
            <ProgramContent
              data={previewData.request_data}
              sectionOptions={sectionOptions}
              programOptions={programOptions}
              classOptions={classOptions}
              majorOptions={majorOptions}
            />
          </div>
          <div className={styles.facilities}>
            <div className={styles.header1}>
              <b className={styles.titleHeader}>FACILITIES</b>
            </div>
            <FacilitiesContent
              data={previewData.request_data}
              pickupPointOptions={pickupPointOptions}
            />
          </div>
          <div className={styles.parentsguardianInformation}>
            <div className={styles.header1}>
              <b className={styles.titleHeader}>
                PARENT / GUARDIAN INFORMATION
              </b>
            </div>
            <ParentsGuardianInformationContent
              data={previewData.request_data}
            />
          </div>
          <div className={styles.termOfPayment}>
            <div className={styles.header1}>
              <b className={styles.titleHeader}>TERM OF PAYMENT</b>
            </div>
            <TermOfPaymentContent
              data={previewData.request_data}
              isDormitory={isDormitorySelected}
            />
          </div>
          <div className={styles.pledge}>
            <div className={styles.header1}>
              <b className={styles.titleHeader}>PLEDGE</b>
            </div>
            <PledgeContent data={previewData.request_data} />
          </div>
          <div className={styles.signature}>
            <SignatureContent data={previewData} />
          </div>
          <div className={styles.otherDetail}>
            <OtherDetailContent data={previewData.request_data} />
          </div>
        </div>

        <div className={pageSize === "A4" ? styles.footerA4 : styles.footerF4}>
          <div className={styles.footerRow}>
            <img
              src={pageSize === "A4" ? footer : footerF4Logos}
              alt="Footer"
              className={
                pageSize === "A4" ? styles.footerImgA4 : styles.footerImgF4
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default Print;
