import React, { useRef } from 'react';
import { NavLink } from 'react-router-dom';
import Icon from '../../Atoms/Icon/Icon';
import useAuth from '../../../hooks/useAuth';
import homeIcon from '../../../assets/Home_icon.svg';
import studentIcon from '../../../assets/Student-List_icon.svg';
import logbookIcon from '../../../assets/Logbook_icon.svg';
import registrationIcon from '../../../assets/Registration_icon.svg';
import usersIcon from '../../../assets/User_icon.svg';
import analyticsIcon from '../../../assets/analytics.png';
import sectionIcon from '../../../assets/Homeroom-List_icon.svg';

import './SidebarMenu.css';

const allMenus = [
  { to: '/Home', icon: homeIcon, label: 'Home' },
  { to: '/Analytics', icon: analyticsIcon, label: 'Analytics' },
  { to: '/Guestbook', icon: logbookIcon, label: 'Guestbook' },
  { to: '/Registration', icon: registrationIcon, label: 'Registration' },
  { to: '/students', icon: studentIcon, label: 'Student List' },
  { to: '/Logbook', icon: logbookIcon, label: 'Logbook' },
  { to: '/Section', icon: sectionIcon, label: 'Section' },
  { to: '/Users', icon: usersIcon, label: 'Users' },
];

const SidebarMenu = ({ isOpen, onClose }) => {
  const { isAdmin } = useAuth();
  const asideRef = useRef(null);

  const filteredMenus = allMenus.filter((menu) => {
    if (menu.to === '/Users') {
      return isAdmin();
    }
    return true;
  });

  const handleMenuClick = () => {
    if (window.innerWidth <= 1000 && onClose) {
      onClose();
    }
  };

  return (
    <aside ref={asideRef} className={`sidebar-menu ${isOpen ? 'open' : ''}`}>
      <nav>
        <ul className='sidebar-menu-list'>
          {filteredMenus.map((menu) => (
            <li key={menu.label}>
              <NavLink
                to={menu.to}
                onClick={handleMenuClick}
                className={({ isActive }) =>
                  'sidebar-menu-item' + (isActive ? ' active' : '')
                }
              >
                <span className='sidebar-menu-icon'>
                  <Icon
                    src={menu.icon}
                    alt={menu.label}
                    style={{ width: 24, height: 24 }}
                  />
                </span>
                <span className='sidebar-menu-label'>{menu.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default SidebarMenu;
