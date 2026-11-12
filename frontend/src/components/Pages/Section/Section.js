import React from 'react';
import styles from './Section.module.css';

const Section = () => (
  <div className={styles.sectionPage}>
    <div className={styles.sectionContainer}>
      <h1 className={styles.sectionTitle}>Section</h1>
      <div className={styles.placeholder}>
        <div className={styles.placeholderTitle}>Under Development</div>
        <div className={styles.placeholderText}>
          This page is currently under development and will be available soon.
        </div>
      </div>
    </div>
  </div>
);

export default Section;
