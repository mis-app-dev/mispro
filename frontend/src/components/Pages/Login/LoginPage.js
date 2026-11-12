import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, getMe, resetLogin } from "../../../services/api";
import Button from "../../Atoms/Button/Button";
import Logo from "../../Atoms/Logo/Logo";
import bgLogin from "../../../assets/bg_login.jpg";
import ellipseTop from "../../../assets/elipse1_login.svg";
import ellipseBottom from "../../../assets/elipse2_login.svg";
import ellipseTopReset from "../../../assets/elipse3_reset.svg";
import ellipseBottomReset from "../../../assets/elipse4_reset.svg";
import eyeClosedIcon from "../../../assets/hide.svg";
import eyeOpenIcon from "../../../assets/open.svg";
import styles from "./LoginPage.module.css";

const LoginPage = () => {
  const [form, setForm] = useState({
    identifier: "",
    password: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const [isResetMode, setIsResetMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      await login(form.identifier, form.password);
      const userData = await getMe();
      localStorage.setItem("user", JSON.stringify(userData));
      navigate("/Home");
    } catch (error) {
      console.error("Login failed:", error);
      setError(
        error.response?.status === 429
          ? "Too many login attempts. Please wait a minute and try again."
          : "Login failed. Please check your Email/Password."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      await resetLogin(form.identifier, form.password);
      alert("Reset login berhasil! Silakan login kembali.");
      setIsResetMode(false);
      setForm({ identifier: "", password: "" });
      setShowPassword(false);
    } catch (error) {
      console.error("Reset login failed:", error);
      const errorMessage =
        error.response?.data?.message ||
        "Reset login failed. Please check your Username/Email.";
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = (e, mode) => {
    e.preventDefault();
    setIsResetMode((prev) => !prev);
    setError("");
    setForm({ identifier: "", password: "" });
    setShowPassword(false);
  };

  const toggleShowPassword = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div
      className={`${styles["login-page-new"]} ${
        isResetMode ? styles["reset-mode"] : ""
      }`}
    >
      {/* Container Kiri (Form) */}
      <div
        className={styles["login-left-new"]}
        key={isResetMode ? "reset-left" : "login-left"}
      >
        <div className={styles["login-card-wrapper"]}>
          <img
            src={ellipseTop}
            alt="Decorative ellipse 1"
            className={styles["login-blob-top"]}
          />
          <img
            src={ellipseBottom}
            alt="Decorative ellipse 2"
            className={styles["login-blob-bottom"]}
          />
          <img
            src={ellipseTopReset}
            alt="Decorative ellipse 3"
            className={styles["login-blob-top-reset"]}
          />
          <img
            src={ellipseBottomReset}
            alt="Decorative ellipse 4"
            className={styles["login-blob-bottom-reset"]}
          />

          <div className={styles["login-card"]}>
            <div className={styles["login-logo"]}>
              <Logo />
            </div>

            <form
              onSubmit={isResetMode ? handleResetSubmit : handleSubmit}
              className={styles["login-form-new"]}
            >
              <h2 className={styles["login-title-new"]}>
                {isResetMode ? "Reset your login" : "Login to your account"}
              </h2>

              {error && (
                <p className={styles["login-error-message"]}>{error}</p>
              )}

              <div className={styles["input-group"]}>
                <input
                  type="text"
                  id="identifier"
                  name="identifier"
                  placeholder="Username or Email"
                  value={form.identifier}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
              </div>

              <div className={styles["input-group"]}>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  placeholder="Password"
                  value={form.password}
                  onChange={handleChange}
                  disabled={isLoading}
                  required
                />
                <img
                  src={showPassword ? eyeOpenIcon : eyeClosedIcon}
                  alt="Toggle password visibility"
                  className={styles["password-toggle-icon"]}
                  onClick={toggleShowPassword}
                />
              </div>         
              
            {/* eslint-disable-next-line jsx-a11y/anchor-is-valid */}
              <a
                href="#"
                className={styles["reset-login-link"]}
                onClick={(e) => toggleMode(e, isResetMode ? "login" : "reset")}
              >
                {isResetMode ? "Login" : "Reset login"}
              </a>

              <div className={styles["button-container"]}>
                <Button type="submit" variant="solid" disabled={isLoading}>
                  {isLoading
            
                    ? "Processing..."
                    : isResetMode
                    ? "Reset"
                    : "Login"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Container Kanan (Gambar) */}
      <div className={styles["login-right-new"]}>
        <img
          src={bgLogin}
          alt="Students"
          className={styles["login-illustration-new"]}
        />
        <div className={styles["login-image-overlay"]}></div>
      </div>
    </div>
  );
};

export default LoginPage;
