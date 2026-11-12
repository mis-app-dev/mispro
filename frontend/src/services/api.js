const API_BASE_URL = process.env.REACT_APP_API_URL;

/**
 * @param {string} endpoint - Endpoint API yang akan dipanggil
 * @param {object} options - Opsi konfigurasi untuk fetch (method, body, dll).
 * @param {boolean} requiresAuth 
 * @returns {Promise<any>} - Data JSON dari response.
 */

const apiFetch = async (endpoint, options = {}, requiresAuth = true) => {
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (requiresAuth) {
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    } else {
      console.error('No token found for authenticated request');
      window.location.href = '/login';
      return Promise.reject(new Error('Authentication token is missing.'));
    }
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && requiresAuth) {
    console.error('Token is expired or invalid. Logging out...');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const error = new Error(`HTTP error! status: ${res.status}`);
    error.response = { data: errorData, status: res.status };
    throw error;
  }

  if (res.status === 204) {
    return null;
  }

  return await res.json();
};

export const login = async (identifier, password) => {
  const data = await apiFetch(
    '/login',
    {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    },
    false
  );
  if (data.token) {
    localStorage.setItem('token', data.token);
  }
  return data;
};

export const resetLogin = async (identifier, password) => {
  return apiFetch(
    '/reset-login',
    {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    },
    false
  );
};

export const logout = async () => {
  try {
    await apiFetch('/logout', { method: 'POST' });
  } catch (error) {
    console.warn(
      'Logout failed on server, proceeding to clear local data.',
      error
    );
  } finally {
    localStorage.removeItem('token');
  }
};

export const getMe = () => apiFetch('/me');

export const getRegistrationOptions = async (params = {}) => {
  const query = new URLSearchParams(params).toString();
  return await apiFetch(`/registration-option?${query}`);
};

export const addSchoolYear = () => {
  return apiFetch('/school-year/add', {
    method: 'POST',
    body: JSON.stringify({}),
  });
};

export const startRegistration = (schoolYear, semester, registrationDate) => {
  return apiFetch('/registration/start', {
    method: 'POST',
    body: JSON.stringify({
      school_year_id: schoolYear,
      semester_id: semester,
      registration_date: registrationDate,
    }),
  });
};

export const submitRegistrationForm = (draftId, formData) => {
  return apiFetch(`/registration/store/${draftId}`, {
    method: 'POST',
    body: JSON.stringify(formData),
  });
};

export const searchStudent = (searchTerm) => {
  return apiFetch(`/students/search?search=${encodeURIComponent(searchTerm)}`);
};

export const getStudentLatestApplication = (id, source) => {
  if (!source) {
    return Promise.reject(new Error("Parameter 'source' diperlukan."));
  }
  return apiFetch(`/students/${id}/latest-application?source=${source}`);
};

export const getRegistrationPreview = (applicationId, versionId) => {
  return apiFetch(
    `/registration/preview/${applicationId}/version/${versionId}`
  );
};

export const getStudents = (filters = {}) => {
  const params = new URLSearchParams();

  params.append('page', filters.page || 1);
  params.append('per_page', filters.per_page || 25);

  if (filters.search) {
    params.append('search', filters.search);
  } else if (filters.search_name) {
    params.append('search_name', filters.search_name);
  }
  if (filters.school_year_id) {
    params.append('school_year_id', filters.school_year_id);
  }

  filters.class_id?.forEach((id) => params.append('class_id[]', id));
  filters.section_id?.forEach((id) => params.append('section_id[]', id));
  filters.enrollment_status?.forEach((status) =>
    params.append('enrollment_status[]', status)
  );
  filters.student_status?.forEach((status) =>
    params.append('student_status[]', status)
  );

  filters.sort?.forEach((s, index) => {
    params.append(`sort[${index}][field]`, s.field);
    params.append(`sort[${index}][order]`, s.order);
  });

  return apiFetch(`/students?${params.toString()}`);
};

export const updateStudent = (id, studentData) => {
  const formData = new FormData();
  formData.append('_method', 'PATCH');
  for (const key in studentData) {
    if (Object.prototype.hasOwnProperty.call(studentData, key)) {
      const value = studentData[key];
      if (value !== null && value !== undefined) {
        formData.append(key, value);
      }
    }
  }

  return apiFetch(`/students/${id}/update`, {
    method: 'POST',
    body: formData,
  });
};

export const getGuestbook = ({
  search_name = '',
  class_id = [],
  start_date = '',
  end_date = '',
  sort = [],
  page = 1,
  per_page = 25,
} = {}) => {
  const params = new URLSearchParams();

  params.append('page', page);
  params.append('per_page', per_page);

  if (search_name) params.append('search_name', search_name);

  (Array.isArray(class_id) ? class_id : []).forEach((v) =>
    params.append('class_id[]', v)
  );

  if (start_date) params.append('start_date', start_date);
  if (end_date) params.append('end_date', end_date);

  // ✅ FIX SORT
  sort?.forEach((s, i) => {
    const field = s.field || s.id;
    const order = s.order || (s.desc ? 'desc' : 'asc');

    params.append(`sort[${i}][field]`, field);
    params.append(`sort[${i}][order]`, order);
  });

  return apiFetch(`/guestbook?${params.toString()}`);
};

export const createGuestbook = (payload) => {
  return apiFetch("/guestbook", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const updateGuestbook = (id, payload) => {
  return apiFetch(`/guestbook/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
};

export const getLogbook = ({
  search_name = '',
  search_family_rank = '',
  search_religion = '',
  search_country = '',
  search_previous_school = '',
  search_father = '',
  search_mother = '',
  grades = [],
  sections = [],
  school_years = [],
  genders = [],
  citizenships = [],
  majors = [],
  transportations = [],
  start_date = '',
  end_date = '',
  min_age = '',
  max_age = '',
  sort = [],
  page = 1,
  per_page = 25,
} = {}) => {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('per_page', per_page);

  if (search_name) params.append('search_name', search_name);
  if (search_family_rank)
    params.append('search_family_rank', search_family_rank);
  if (search_religion) params.append('search_religion', search_religion);
  if (search_country) params.append('search_country', search_country);
  if (search_previous_school)
    params.append('search_previous_school', search_previous_school);
  if (search_father) params.append('search_father', search_father);
  if (search_mother) params.append('search_mother', search_mother);

  (Array.isArray(grades) ? grades : []).forEach((v) =>
    params.append('grades[]', v)
  );
  (Array.isArray(sections) ? sections : []).forEach((v) =>
    params.append('sections[]', v)
  );
  (Array.isArray(school_years) ? school_years : []).forEach((v) =>
    params.append('school_years[]', v)
  );
  (Array.isArray(genders) ? genders : []).forEach((v) =>
    params.append('genders[]', v)
  );
  (Array.isArray(citizenships) ? citizenships : []).forEach((v) =>
    params.append('citizenships[]', v)
  );
  (Array.isArray(majors) ? majors : []).forEach((v) =>
    params.append('majors[]', v)
  );
  (Array.isArray(transportations) ? transportations : []).forEach((v) =>
    params.append('transportations[]', v)
  );

  if (start_date) params.append('start_date', start_date);
  if (end_date) params.append('end_date', end_date);

  if (min_age !== '' && min_age !== null) params.append('min_age', min_age);
  if (max_age !== '' && max_age !== null) params.append('max_age', max_age);

  sort?.forEach((s, i) => {
    params.append(`sort[${i}][field]`, s.field);
    params.append(`sort[${i}][order]`, s.order);
  });

  return apiFetch(`/logbook?${params.toString()}`);
};

export const getLogbookForExport = ({
  search_name = '',
  search_family_rank = '',
  search_religion = '',
  search_country = '',
  search_previous_school = '',
  search_father = '',
  search_mother = '',
  grades = [],
  sections = [],
  school_years = [],
  genders = [],
  citizenships = [],
  majors = [],
  transportations = [],
  start_date = '',
  end_date = '',
  min_age = '',
  max_age = '',
  sort = [],
} = {}) => {
  const params = new URLSearchParams();

  if (search_name) params.append('search_name', search_name);
  if (search_family_rank)
    params.append('search_family_rank', search_family_rank);
  if (search_religion) params.append('search_religion', search_religion);
  if (search_country) params.append('search_country', search_country);
  if (search_previous_school)
    params.append('search_previous_school', search_previous_school);
  if (search_father) params.append('search_father', search_father);
  if (search_mother) params.append('search_mother', search_mother);

  (Array.isArray(grades) ? grades : []).forEach((v) =>
    params.append('grades[]', v)
  );
  (Array.isArray(sections) ? sections : []).forEach((v) =>
    params.append('sections[]', v)
  );
  (Array.isArray(school_years) ? school_years : []).forEach((v) =>
    params.append('school_years[]', v)
  );
  (Array.isArray(genders) ? genders : []).forEach((v) =>
    params.append('genders[]', v)
  );
  (Array.isArray(citizenships) ? citizenships : []).forEach((v) =>
    params.append('citizenships[]', v)
  );
  (Array.isArray(majors) ? majors : []).forEach((v) =>
    params.append('majors[]', v)
  );
  (Array.isArray(transportations) ? transportations : []).forEach((v) =>
    params.append('transportations[]', v)
  );

  if (start_date) params.append('start_date', start_date);
  if (end_date) params.append('end_date', end_date);

  if (min_age !== '' && min_age !== null) params.append('min_age', min_age);
  if (max_age !== '' && max_age !== null) params.append('max_age', max_age);

  sort?.forEach((s, i) => {
    params.append(`sort[${i}][field]`, s.field);
    params.append(`sort[${i}][order]`, s.order);
  });

  return apiFetch(`/logbook/export?${params.toString()}`);
};

export const getRegistrations = ({
  search = '',
  search_name = '',
  search_id = '',
  start_date = null,
  end_date = null,
  grade = null,
  section = null,
  status = null,
  sort = null,
  page = 1,
  per_page = 10,
} = {}) => {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('per_page', per_page);

  if (search) {
    params.append('search', search);
  } else if (search_name) {
    params.append('search_name', search_name);
  }
  if (search_id) params.append('search_id', search_id);
  if (start_date) params.append('start_date', start_date);
  if (end_date) params.append('end_date', end_date);

  if (Array.isArray(grade)) {
    grade.forEach((id) => params.append('grade[]', id));
  } else if (grade) {
    params.append('grade[]', grade);
  }

  if (Array.isArray(section)) {
    section.forEach((id) => params.append('section[]', id));
  } else if (section) {
    params.append('section[]', section);
  }

  if (Array.isArray(status)) {
    status.forEach((status) => params.append('status[]', status));
  } else if (status) {
    params.append('status[]', status);
  }

  sort?.forEach((s, index) => {
    params.append(`sort[${index}][field]`, s.field);
    params.append(`sort[${index}][order]`, s.order);
  });

  return apiFetch(`/registration?${params.toString()}`);
};

export const cancelRegistration = (applicationId, reasonType, payload = {}) => {
  const method = 'POST';

  if (reasonType === 'cancellationOfEnrollment' && payload.notes) {
    return apiFetch(`/registration/${applicationId}/cancel/${reasonType}`, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  return apiFetch(`/registration/${applicationId}/cancel/${reasonType}`, {
    method: method,
  });
};

export const getStudentHistoryDates = (id) =>
  apiFetch(`/students/${id}/history-dates`);

export const getHistoryDetail = (id, versionId) =>
  apiFetch(`/students/${id}/history/${versionId}`);

export const getDashboard = () => {
  return apiFetch('/dashboard', { method: 'GET' });
};

export const getUsers = ({
  page = 1,
  per_page = 25,
  search = '',
  username = '',
  full_name = '',
  email = '',
  user_id = '',
  role = [],
  sort_by = '',
  sort_dir = '',
} = {}) => {
  const params = new URLSearchParams();
  params.append('page', page);
  params.append('per_page', per_page);

  if (search) params.append('search', search);
  if (username) params.append('username', username);
  if (full_name) params.append('full_name', full_name);
  if (email) params.append('email', email);
  if (user_id) params.append('user_id', user_id);

  if (Array.isArray(role)) {
    role.forEach((r) => params.append('role[]', r));
  } else if (role) {
    params.append('role[]', role);
  }

  if (sort_by) params.append('sort_by', sort_by);
  if (sort_dir) params.append('sort_dir', sort_dir);

  return apiFetch(`/users?${params.toString()}`);
};

export const deleteUser = (userId) => {
  return apiFetch(`/users/${userId}`, {
    method: 'DELETE',
  });
};

export const postUser = async (userData) => {
  return apiFetch('/users', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
};

export const updateUser = (userId, userData) => {
  return apiFetch(`/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(userData),
  });
};

export const getCancelledRegistrations = (filters = {}) => {
  const params = new URLSearchParams();

  params.append('page', filters.page || 1);
  params.append('per_page', filters.per_page || 25);

  if (filters.search) params.append('search', filters.search);
  if (filters.filter_name) params.append('filter_name', filters.filter_name);
  if (filters.filter_notes) params.append('filter_notes', filters.filter_notes);

  if (filters.reg_start_date)
    params.append('reg_start_date', filters.reg_start_date);
  if (filters.reg_end_date) params.append('reg_end_date', filters.reg_end_date);
  if (filters.cancel_start_date)
    params.append('cancel_start_date', filters.cancel_start_date);
  if (filters.cancel_end_date)
    params.append('cancel_end_date', filters.cancel_end_date);

  if (Array.isArray(filters.sections)) {
    filters.sections.forEach((v) => params.append('sections[]', v));
  }
  if (Array.isArray(filters.student_status)) {
    filters.student_status.forEach((v) => params.append('student_status[]', v));
  }
  if (Array.isArray(filters.school_years)) {
    filters.school_years.forEach((v) => params.append('school_years[]', v));
  }
  if (Array.isArray(filters.grades)) {
    filters.grades.forEach((v) => params.append('grades[]', v));
  }

  if (filters.sort_by) params.append('sort_by', filters.sort_by);
  if (filters.sort_order) params.append('sort_order', filters.sort_order);

  return apiFetch(`/registration/cancelled-registrations?${params.toString()}`);
};

export const getAutoGraduatePreview = () => {
  return apiFetch('/students/auto-graduate/preview', {
    method: 'POST',
  });
};

export const confirmAutoGraduate = (ids) => {
  return apiFetch('/students/auto-graduate/confirm', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
};
export const getAnalytics = (refresh = false) => {
  const endpoint = refresh ? '/analytics?refresh=true' : '/analytics';
  return apiFetch(endpoint);
};

export const saveStudentCardNumber = (id, cardNumber) => {
  return apiFetch(`/students/${id}/card-number`, {
    method: 'POST',
    body: JSON.stringify({ card_number: cardNumber }),
  });
};

export const fetchAuthenticatedImage = async (url) => {
  if (!url) return null;

  if (url.startsWith('data:') || url.startsWith('blob:')) {
    return url;
  }

  const token = localStorage.getItem('token');
  const headers = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error('Failed to load image');

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error loading secure image:', error);
    return null;
  }
};
