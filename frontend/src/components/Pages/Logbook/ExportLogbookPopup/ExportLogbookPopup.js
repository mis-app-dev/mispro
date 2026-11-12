import React, { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import styles from "./ExportLogbookPopup.module.css";
import placeholder from "../../../../assets/user.svg";

const loadImage = (url) =>
  new Promise((resolve) => {
    if (!url || url === placeholder) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      try {
        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL);
      } catch (e) {
        console.error(
          "Gagal konversi canvas ke DataURL (mungkin Tainted Canvas / CORS):",
          url,
          e
        );
        resolve(null);
      }
    };
    img.onerror = (err) => {
      console.error("Gagal me-load gambar dari URL:", url, err);
      resolve(null);
    };
    try {
      img.src = url;
    } catch (e) {
      console.error("Error saat set img.src (URL tidak valid?):", url, e);
      resolve(null);
    }
  });

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

// Name parts a student does not have stay empty instead of showing "-".
const BLANK_WHEN_EMPTY = new Set(["First Name", "Middle Name", "Last Name"]);

const ExportLogbookPopup = ({
  isOpen,
  onClose,
  columns,
  selectedColumns,
  fetchFullData,
  isExportLoading,
  currentFilters,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    if (isOpen && !dataLoaded && !isExportLoading) {
      fetchFullData()
        .then((data) => {
          setPreviewData(data);
          setDataLoaded(true);
        })
        .catch((err) => {
          console.error("Gagal memuat data export di popup:", err);
          setPreviewData([]);
          setDataLoaded(true);
        });
    }

    if (!isOpen) {
      setPreviewData([]);
      setDataLoaded(false);
    }
  }, [isOpen, dataLoaded, isExportLoading, fetchFullData]);

  const selectedColumnsForPreview = columns.filter((column) =>
    selectedColumns.has(column)
  );
  const hasSelectedColumns = selectedColumnsForPreview.length > 0;

  const logbookData = previewData;

  const currentLoading = isExportLoading || (isOpen && !dataLoaded);

  // --- FUNGSI DOWNLOAD (HOOK) ---
  const handleDownloadPDF = useCallback(async () => {
    if (
      !hasSelectedColumns ||
      isDownloading ||
      !dataLoaded ||
      logbookData.length === 0
    )
      return;

    setIsDownloading(true);

    try {
      const globalColors = {
        mainText: [0, 0, 0],
        mainGrey: [0, 0, 0],
        secondaryBg: [255, 255, 255],
      };

      const columnsForPDFTable = columns.filter(
        (column) => selectedColumns.has(column) && column !== "School Year"
      );
      const tableHeaders = ["No.", ...columnsForPDFTable];
      const photoColIndex = tableHeaders.indexOf("Photo");

      const loadedImages = await Promise.all(
        logbookData.map((student) =>
          loadImage(student[HEADER_KEY_MAP["Photo"]])
        )
      );

      const tableData = logbookData.map((student, index) => {
        const row = [index + 1];
        columnsForPDFTable.forEach((column) => {
          if (column === "Photo") {
            row.push(null);
          } else {
            const dataKey = HEADER_KEY_MAP[column];
            const cellData =
              student[dataKey] === null || student[dataKey] === undefined
                ? BLANK_WHEN_EMPTY.has(column)
                  ? ""
                  : "-"
                : String(student[dataKey]);
            row.push(cellData);
          }
        });
        return row;
      });

      const doc = new jsPDF("landscape", "mm", [210, 330]);
      const margin = 7;
      const firstStudent = logbookData.length > 0 ? logbookData[0] : null;
      const schoolYear = firstStudent ? firstStudent.school_year : "N/A";
      const titleText = `Student Logbook (School Year: ${schoolYear})`;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(
        globalColors.mainText[0],
        globalColors.mainText[1],
        globalColors.mainText[2]
      );
      doc.text(titleText, margin, 15);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      const now = new Date();
      const createdDate = `Created: ${now
        .getDate()
        .toString()
        .padStart(2, "0")}/${(now.getMonth() + 1)
        .toString()
        .padStart(2, "0")}/${now.getFullYear()} ${now
        .getHours()
        .toString()
        .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now
        .getSeconds()
        .toString()
        .padStart(2, "0")}`;
      doc.text(createdDate, margin, 22);
      const colCount = columnsForPDFTable.length;

      let dynamicImgHeight = 12;
      let dynamicFontSize = 4;

      if (colCount <= 5) {
        dynamicImgHeight = 24;
        dynamicFontSize = 12;
      } else if (colCount <= 9) {
        dynamicImgHeight = 18;
        dynamicFontSize = 9;
      } else if (colCount <= 14) {
        dynamicImgHeight = 14;
        dynamicFontSize = 6;
      } else {
        dynamicImgHeight = 12;
        dynamicFontSize = 4;
      }

      const fixedImgHeight = dynamicImgHeight;
      const aspectRatio = 59.97 / 81;
      const globalCellPadding = 2.5;
      const fixedImgWidth = fixedImgHeight * aspectRatio;
      const photoCellWidth = fixedImgWidth + globalCellPadding * 2;
      const photoCellHeight = fixedImgHeight + globalCellPadding * 2;

      autoTable(doc, {
        head: [tableHeaders],
        body: tableData,
        startY: 28,
        margin: { left: margin, right: margin },
        theme: "grid",
        rowPageBreak: "auto",
        styles: {
          font: "helvetica",
          fontSize: dynamicFontSize,
          cellPadding: globalCellPadding,
          textColor: globalColors.mainText,
          lineColor: globalColors.mainGrey,
          lineWidth: 0.2,
          valign: "middle",
          minCellHeight: 1,
        },
        headStyles: {
          fontSize: dynamicFontSize,
          fillColor: globalColors.secondaryBg,
          textColor: globalColors.mainText,
          halign: "middle",
          minCellHeight: 7,
        },
        bodyStyles: {
          halign: "left",
        },
        columnStyles: {
          [photoColIndex]: {
            cellWidth: photoCellWidth,
            minCellHeight: photoCellHeight,
            halign: "center",
          },
        },

        willDrawCell: (data) => {
          if (
            photoColIndex !== -1 &&
            data.column.index === photoColIndex &&
            data.cell.section === "body"
          ) {
            data.cell.text = [];
          }
        },

        didDrawCell: (data) => {
          if (
            photoColIndex !== -1 &&
            data.column.index === photoColIndex &&
            data.cell.section === "body"
          ) {
            const cellHeight = data.cell.height;
            const cellWidth = data.cell.width;
            const imgData = loadedImages[data.row.index];

            if (imgData) {
              const imgHeight = fixedImgHeight; 
              const imgWidth = fixedImgWidth; 

              const x = data.cell.x + (cellWidth - imgWidth) / 2;
              const y = data.cell.y + (cellHeight - imgHeight) / 2;

              try {
                doc.addImage(imgData, "PNG", x, y, imgWidth, imgHeight);
                const originalDrawColor = doc.getDrawColor();
                const originalLineWidth = doc.getLineWidth();
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.2);
                doc.rect(x, y, imgWidth, imgHeight);
                doc.setDrawColor(originalDrawColor);
                doc.setLineWidth(originalLineWidth);
              } catch (e) {
                console.error("Gagal menambah gambar ke PDF:", e);
                doc.text(
                  "X",
                  data.cell.x + cellWidth / 2,
                  data.cell.y + cellHeight / 2,
                  { halign: "center", valign: "middle" }
                );
              }
            } else {
              doc.text(
                "-",
                data.cell.x + cellWidth / 2,
                data.cell.y + cellHeight / 2,
                { halign: "center", valign: "middle" }
              );
            }
          }
        },
      });

      // --- Logika Nomor Halaman ---
      const pageCount = doc.internal.getNumberOfPages();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.text(
          `Page ${i} of ${pageCount}`,
          doc.internal.pageSize.width - margin,
          doc.internal.pageSize.height - 5,
          { align: "right" }
        );
      }

      const fileName = `Student_Logbook_${
        new Date().toISOString().split("T")[0]
      }.pdf`;
      doc.save(fileName);
    } catch (err) {
      console.error("Gagal membuat PDF:", err);
    } finally {
      setIsDownloading(false);
    }
  }, [
    columns,
    selectedColumns,
    logbookData,
    hasSelectedColumns,
    isDownloading,
    dataLoaded,
  ]);

  if (!isOpen) return null;

  return ReactDOM.createPortal(
    <div className={styles.overlay}>
      <div className={styles.popup}>
        <div className={styles.header}>
          <h2 className={styles.title}>Export Student Logbook</h2>
        </div>

        <div className={styles.content}>
          {currentLoading ? (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                fontStyle: "italic",
                color: "#7a7a7a",
                minHeight: "200px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f9f9f9",
                borderRadius: "8px",
              }}
            >
              Memuat **semua** data logbook sesuai filter. Mohon tunggu...
            </div>
          ) : hasSelectedColumns ? (
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.headerCell}>No.</th>
                    {selectedColumnsForPreview.map((column) => (
                      <th key={column} className={styles.headerCell}>
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logbookData.slice(0, 10).map((student, index) => (
                    <tr key={student.student_id}>
                      <td className={styles.dataCell}>{index + 1}</td>
                      {selectedColumnsForPreview.map((column) => {
                        const dataKey = HEADER_KEY_MAP[column];
                        if (column === "Photo") {
                          return (
                            <td key={column} className={styles.photoCell}>
                              <img
                                src={student[dataKey] || placeholder}
                                alt={student.full_name}
                                className={styles.studentPhoto}
                              />
                            </td>
                          );
                        }
                        return (
                          <td key={column} className={styles.dataCell}>
                            {student[dataKey] || (BLANK_WHEN_EMPTY.has(column) ? "" : "-")}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {logbookData.length > 10 && (
                    <tr>
                      <td
                        colSpan={selectedColumnsForPreview.length + 1}
                        className={styles.messageCell}
                        style={{
                          textAlign: "center",
                          fontStyle: "italic",
                          backgroundColor: "#f0f0f0",
                        }}
                      >
                        ... dan {logbookData.length - 10} data lainnya
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                fontStyle: "italic",
                color: "#7a7a7a",
                minHeight: "200px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "#f9f9f9",
                borderRadius: "8px",
              }}
            >
              Please select at least one column first to see the preview.
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.buttonGroup}>
            <button
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isDownloading || currentLoading}
            >
              Cancel
            </button>

            <button
              className={styles.downloadButton}
              onClick={handleDownloadPDF}
              disabled={
                !hasSelectedColumns ||
                isDownloading ||
                currentLoading ||
                logbookData.length === 0
              }
            >
              {isDownloading
                ? "Generating PDF..."
                : currentLoading
                ? "Loading Data..."
                : "Download PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ExportLogbookPopup;
