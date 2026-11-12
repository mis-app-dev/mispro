import React, { useCallback, useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom"; 

import styles from "./Users.module.css";
import Button from "../../Atoms/Button/Button";
import ColumnHeader from "../../Molecules/ColumnHeader/ColumnHeader";
import SearchBar from "../../Molecules/SearchBar/SearchBar";
import upenIcon from "../../../assets/edit_pen.png";
import utrashAltIcon from "../../../assets/trash_icon.png";
import PopUpForm from "../../Molecules/PopUp/PopUpRegis/PopUpForm";
import {
  getUsers,
  deleteUser,
  postUser,
  updateUser,
} from "../../../services/api";
import ResetFilterButton from "../../Atoms/ResetFilterButton/ResetFilterButton";

const REFRESH_INTERVAL = 5000;
const formatRole = (role) => {
  if (!role) return "";
  return role
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const Users = () => {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // eslint-disable-next-line
  const [page, setPage] = useState(1);
  const fetchControllerRef = useRef(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

  const [confirmDeleteUser, setConfirmDeleteUser] = useState(null);
  const [popupMessage, setPopupMessage] = useState("");
  const [popupType, setPopupType] = useState("");
  const [showPopup, setShowPopup] = useState(false);
  const [showUserPopup, setShowUserPopup] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  const showTemporaryPopup = (message, type) => {
    setPopupType(type);
    setPopupMessage(message);
    setShowPopup(true);
    setTimeout(() => setShowPopup(false), 3000);
  };

  const fetchUsers = useCallback(
    async (options = {}) => {
      const { isBackgroundRefresh = false } = options;
      if (!isBackgroundRefresh) setLoading(true);
      setError("");

      const controller = new AbortController();
      const signal = controller.signal;
      fetchControllerRef.current?.abort();
      fetchControllerRef.current = controller;

      try {
        const response = await getUsers({ page }, { signal });
        if (response?.success) {
          setUsers(response.data.data || []);
        } else {
          setError("Failed to load users");
        }
      } catch (err) {
        if (err.name === "AbortError") return;
        console.error(err);
        setError("Error fetching user data");
      } finally {
        if (!isBackgroundRefresh) setLoading(false);
      }
    },
    [page]
  );

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchUsers({ isBackgroundRefresh: true });
    }, REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [fetchUsers]);

  const filteredUsers = users.filter((user) =>
    [user.username, user.user_id, user.full_name]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const handleConfirmDelete = async () => {
    if (!confirmDeleteUser) return;
    setDeletingUserId(confirmDeleteUser.user_id);

    try {
      await deleteUser(confirmDeleteUser.user_id);
      showTemporaryPopup(
        `User "${confirmDeleteUser.username}" has been deleted.`,
        "success"
      );
      await fetchUsers();
    } catch (error) {
      console.error("Failed to delete user:", error);
      showTemporaryPopup("Failed to delete user. Please try again.", "error");
    } finally {
      setDeletingUserId(null);
      setConfirmDeleteUser(null);
    }
  };

  const handleAddUser = async (userData, resetForm) => {
    if (
      !userData.username ||
      !userData.full_name ||
      !userData.email ||
      !userData.password ||
      !userData.role
    ) {
      showTemporaryPopup("All fields are required.", "error");
      return;
    }

    try {
      const response = await postUser(userData);
      const username = response.data?.username || userData.username;
      showTemporaryPopup(
        `User "${username}" has been added successfully.`,
        "success"
      );
      await fetchUsers();

      if (typeof resetForm === "function") resetForm();
      setShowUserPopup(false);
    } catch (error) {
      console.error("Failed to add user:", error);
      const errorMessage =
        error.response?.data?.message ||
        "Failed to add user. Please try again.";
      showTemporaryPopup(errorMessage, "error");
    }
  };

  const handleUpdateUser = async (userId, userData) => {
    if (
      !userData.username ||
      !userData.full_name ||
      !userData.email ||
      !userData.role
    ) {
      showTemporaryPopup(
        "Username, Full Name, Email, and Role are required.",
        "error"
      );
      return;
    }

    try {
      const response = await updateUser(userId, userData);
      const username = response.data?.username || userData.username;

      showTemporaryPopup(
        `User "${username}" has been updated successfully.`,
        "success"
      );

      await fetchUsers();
      setEditingUser(null);
    } catch (error) {
      console.error("Failed to update user:", error);
      const errorMessage =
        error.response?.data?.message ||
        "Failed to update user. Please try again.";
      showTemporaryPopup(errorMessage, "error");
    }
  };

  const handleResetFilters = () => {
    setSearch("");
  };

  return (
    <div className={styles.usersContainer}>
      <h2 className={styles.pageTitle}>Users</h2>
      <div className={styles.usersHeaderContent}>
        <div className={styles.searchAndFilterContainer}>
          <SearchBar
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find username, name, or user ID"
          />
          <ResetFilterButton onClick={handleResetFilters} />
        </div>

        <div className={styles.button2Parent}>
          <Button variant="solid" onClick={() => setShowUserPopup(true)}>
            New User
          </Button>
          {showUserPopup && (
            <PopUpForm
              type="user"
              onClose={() => setShowUserPopup(false)}
              onCreate={(data, resetForm) => handleAddUser(data, resetForm)}
            />
          )}
          {editingUser && (
            <PopUpForm
              type="user"
              onClose={() => setEditingUser(null)}
              onCreate={(data) => handleUpdateUser(editingUser.user_id, data)}
              isEditMode={true}
              initialData={editingUser}
            />
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingText}>Loading users...</div>
      ) : error ? (
        <div className={styles.errorText}>{error}</div>
      ) : (
        <div className={styles.tableContainer}>
          <div className={styles.tableHeader}>
            <ColumnHeader title="User ID" hasFilter={false} hasSort={false} />
            <ColumnHeader title="Username" hasFilter={false} hasSort={true} />
            <ColumnHeader title="Name" hasFilter={false} hasSort={true} />
            <ColumnHeader title="User Email" hasFilter={false} hasSort={true} />
            <ColumnHeader title="Role" hasFilter={true} hasSort={true} />
            <ColumnHeader title="Actions" hasSort={false} hasFilter={false} />
          </div>

          <div className={styles.tableBody}>
            {filteredUsers.length === 0 ? (
              <div className={styles.noData}>No users found</div>
            ) : (
              filteredUsers.map((user) => (
                <div key={user.user_id} className={styles.tableRow}>
                  <div className={styles.tableCell} title={user.user_id}>
                    {user.user_id}
                  </div>
                  <div className={styles.tableCell} title={user.username}>
                    {user.username}
                  </div>
                  <div className={styles.tableCell} title={user.name}>
                    {user.full_name || "-"}
                  </div>
                  <div className={styles.tableCell} title={user.email}>
                    {user.email}
                  </div>
                  <div
                    className={styles.tableCell}
                    title={formatRole(user.role)}
                  >
                    {formatRole(user.role)}
                  </div>
                  <div className={styles.actionCell}>
                    <div className={styles.actionContainer}>
                      <button
                        className={styles.actionButton}
                        onClick={() => setEditingUser(user)}
                        aria-label="Edit User"
                      >
                        <img
                          src={upenIcon}
                          alt="Edit"
                          className={`${styles.icon} ${styles.editIcon}`}
                        />
                      </button>
                      <button
                        className={styles.actionButton}
                        onClick={() => setConfirmDeleteUser(user)}
                        disabled={deletingUserId === user.user_id}
                        aria-label="Delete User"
                      >
                        <img
                          src={utrashAltIcon}
                          alt="Delete"
                          className={`${styles.icon} ${styles.deleteIcon}`}
                        />
                        {deletingUserId === user.user_id && (
                          <span className={styles.deletingText}>
                            Deleting...
                          </span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {confirmDeleteUser && ReactDOM.createPortal(
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3>Confirm Deletion</h3>
            <p>
              Are you sure you want to delete user "
              <strong>{confirmDeleteUser.username}</strong>"?
            </p>
            <div className={styles.modalActions}>
              <Button
                variant="solid"
                onClick={handleConfirmDelete}
                disabled={deletingUserId === confirmDeleteUser.user_id}
              >
                {deletingUserId === confirmDeleteUser.user_id
                  ? "Deleting..."
                  : "Yes, Delete"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setConfirmDeleteUser(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showPopup && ReactDOM.createPortal(
        <div
          className={`${styles.popup} ${
            popupType === "success" ? styles.success : styles.error
          }`}
        >
          {popupMessage}
        </div>,
        document.body
      )}
    </div>
  );
};

export default Users;