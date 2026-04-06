/* ══════════════════════════════════════════════════════════════════════════
   Nuit Noire — Dashboard Core
   Toast system, live prediction, animated gauge, charts, counters, reveals
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Global Nuit Namespace ─────────────────────────────────────────────── */
const Nuit = (() => {
  let toastContainer = null;

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container';
      document.body.appendChild(toastContainer);
    }
  }

  function toast(message, type = 'info') {
    ensureToastContainer();
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${escapeHtml(message)}</span>`;
    toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove());
    }, 3500);
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  return { toast, escapeHtml };
})();

/* ── I18N ─────────────────────────────────────────────────────────────── */
const NuitI18n = (() => {
  const STORAGE_KEY = 'nuit-lang';
  const SUPPORTED = ['en', 'hi', 'mr', 'hinglish'];
  const LANG_ATTR = { en: 'en', hi: 'hi', mr: 'mr', hinglish: 'en' };

  const MESSAGES = {
    en: {
      lang_name_en: 'English',
      lang_name_hi: 'Hindi',
      lang_name_mr: 'Marathi',
      lang_name_hinglish: 'Hinglish',

      nav_home: 'Home',
      nav_explore: 'Explore',
      nav_predict: 'Predict',
      nav_analytics: 'Analytics',
      nav_report: 'Report',
      nav_about: 'About',
      lang_aria: 'Select language',

      home_h1: "Navigate Mumbai's Darkest Hours Safely",
      home_subtitle: 'AI-powered risk intelligence mapping 20 neighborhoods across Mumbai — helping you find safer routes after dark.',
      home_btn_explore: 'Explore Map',
      home_btn_predict: 'Try AI Predictor',

      predict_title: 'AI Risk Predictor',
      predict_subtitle: 'Check how safe your area is right now — we auto-detect your location.',
      detecting_location: 'Detecting your location...',
      use_my_location: '📍 Use My Location',
      detect_my_location: '📍 Detect My Location',
      neighborhood: '📍 Neighborhood',
      time_of_day: '🕐 Time of Day',
      tune_optional: '⚙️ Fine-tune parameters (optional)',
      lighting_level: '💡 Lighting Level',
      traffic_density: '🚗 Traffic Density',
      accident_history: '⚠️ Accident History',
      area_type: '📍 Area Type',
      submit_custom_predict: 'Predict with Custom Parameters',
      select_area_opt: '— Select your area —',
      none0: 'None (0)',
      some1: 'Some (1)',
      high2: 'High (2)',
      urban: 'Urban',
      suburban: 'Suburban',
      rural: 'Rural',
      midnight: 'Midnight',
      noon: 'Noon',
      pm11: '11 PM',
      dark: 'Dark',
      bright: 'Bright',
      deserted: 'Deserted',
      heavy: 'Heavy',
      located_near: 'Located near {zone}',

      report_title: 'Report an Incident',
      report_subtitle: 'Help make Mumbai safer — report broken lights, unsafe roads, or suspicious activity.',
      submit_report: 'Submit Report',
      report_submitted: 'Report Submitted!',
      report_thank_you: 'Thank you for helping keep Mumbai safe.',
      location_name: 'Location Name',
      latitude_optional: 'Latitude (optional)',
      longitude_optional: 'Longitude (optional)',
      issue_type: 'Issue Type',
      description: 'Description',
      issue_select: '— Select Issue —',
      issue_broken_light: '🔦 Broken Street Light',
      issue_suspicious: '👁️ Suspicious Activity',
      issue_unsafe_road: '🚧 Unsafe Road Condition',
      issue_other: '📝 Other',
      admin_dashboard: 'Admin Dashboard',
      authorized_only: 'Authorized personnel only',
      username: 'Username',
      password: 'Password',
      authenticate: 'Authenticate',
      total: 'Total',
      pending: 'Pending',
      investigating: 'Investigating',
      resolved: 'Resolved',
      login_to_view_reports: 'Login to view reports',
      no_reports_yet: 'No reports yet',

      analytics_title: 'Night Safety Dashboard',
      analytics_subtitle: 'Mumbai metropolitan area · Real-time zone analytics',
      time_window: 'Time Window',
      risk_level: 'Risk Level',
      tw_night: 'Night (20:00–05:00)',
      tw_late: 'Late Night (23:00–03:00)',
      tw_all: 'All Hours',
      all_levels: 'All Levels',
      high_risk: 'High Risk',
      medium_risk: 'Medium Risk',
      low_risk: 'Low Risk',

      about_title: 'About Nuit Noire',
      about_subtitle: 'Empowering safer nighttime travel across Mumbai through data science and machine learning.',

      report_success_toast: 'Incident reported successfully!',
      submission_failed: 'Submission failed',
      network_try_again: 'Network error — try again',
      admin_authenticated: 'Admin authenticated',
      invalid_credentials: 'Invalid credentials',
      failed_load_reports: 'Failed to load reports',
      report_status_update: 'Report #{id} → {status}',
      update_failed: 'Update failed',
      submitting: 'Submitting...',

      feature_lighting: 'Lighting',
      feature_traffic: 'Traffic',
      feature_history: 'History',
      feature_time: 'Time',
      risk_label: '{level} Risk',

      kpi_total_zones: 'Total Zones Monitored',
      kpi_high_risk: 'High Risk Zones',
      kpi_avg_score: 'Avg Risk Score',
      kpi_peak_hour: 'Peak Danger Hour',
      kpi_safest: 'Safest Zone',
      kpi_dangerous: 'Most Dangerous',
      highest_incident_rate: 'Highest incident rate',
      lowest_risk_score: 'Lowest risk score',
      highest_risk_score: 'Highest risk score',
      incidents: 'Incidents',
      accidents: 'Accidents',
      count: 'Count',
      risk_score_tooltip: 'Risk Score: {score}',
    },
    hi: {
      lang_name_en: 'अंग्रेजी', lang_name_hi: 'हिंदी', lang_name_mr: 'मराठी', lang_name_hinglish: 'हिंग्लिश',
      nav_home: 'होम', nav_explore: 'एक्सप्लोर', nav_predict: 'प्रिडिक्ट', nav_analytics: 'एनालिटिक्स', nav_report: 'रिपोर्ट', nav_about: 'अबाउट',
      lang_aria: 'भाषा चुनें',
      home_h1: 'मुंबई की रात में सुरक्षित सफर करें',
      home_subtitle: 'AI आधारित रिस्क इंटेलिजेंस 20 इलाकों का मानचित्रण करता है और रात में सुरक्षित रास्ते ढूंढने में मदद करता है।',
      home_btn_explore: 'मैप देखें', home_btn_predict: 'AI प्रिडिक्टर आज़माएं',
      predict_title: 'AI रिस्क प्रिडिक्टर', predict_subtitle: 'अभी आपका इलाका कितना सुरक्षित है देखें — लोकेशन ऑटो-डिटेक्ट होती है।',
      detecting_location: 'आपकी लोकेशन पता की जा रही है...', use_my_location: '📍 मेरी लोकेशन इस्तेमाल करें', detect_my_location: '📍 मेरी लोकेशन पता करें',
      neighborhood: '📍 इलाका', time_of_day: '🕐 समय', tune_optional: '⚙️ पैरामीटर बदलें (वैकल्पिक)',
      lighting_level: '💡 रोशनी स्तर', traffic_density: '🚗 ट्रैफिक घनत्व', accident_history: '⚠️ दुर्घटना इतिहास', area_type: '📍 क्षेत्र प्रकार',
      submit_custom_predict: 'कस्टम पैरामीटर से प्रिडिक्ट करें', select_area_opt: '— अपना इलाका चुनें —',
      none0: 'नहीं (0)', some1: 'कुछ (1)', high2: 'ज्यादा (2)', urban: 'शहरी', suburban: 'उप-शहरी', rural: 'ग्रामीण',
      midnight: 'आधी रात', noon: 'दोपहर', pm11: 'रात 11 बजे', dark: 'अंधेरा', bright: 'उजाला', deserted: 'सुनसान', heavy: 'भारी',
      located_near: 'आप {zone} के पास हैं',
      report_title: 'घटना रिपोर्ट करें', report_subtitle: 'मुंबई को सुरक्षित बनाने में मदद करें — खराब लाइट, असुरक्षित सड़क या संदिग्ध गतिविधि रिपोर्ट करें।',
      submit_report: 'रिपोर्ट जमा करें', report_submitted: 'रिपोर्ट जमा हो गई!', report_thank_you: 'मुंबई को सुरक्षित रखने में मदद के लिए धन्यवाद।',
      location_name: 'स्थान का नाम', latitude_optional: 'अक्षांश (वैकल्पिक)', longitude_optional: 'देशांतर (वैकल्पिक)',
      issue_type: 'समस्या प्रकार', description: 'विवरण', issue_select: '— समस्या चुनें —', issue_broken_light: '🔦 खराब स्ट्रीट लाइट',
      issue_suspicious: '👁️ संदिग्ध गतिविधि', issue_unsafe_road: '🚧 असुरक्षित सड़क स्थिति', issue_other: '📝 अन्य',
      admin_dashboard: 'एडमिन डैशबोर्ड', authorized_only: 'केवल अधिकृत कर्मियों के लिए', username: 'यूज़रनेम', password: 'पासवर्ड', authenticate: 'प्रमाणित करें',
      total: 'कुल', pending: 'लंबित', investigating: 'जांच में', resolved: 'सुलझा', login_to_view_reports: 'रिपोर्ट देखने के लिए लॉगिन करें', no_reports_yet: 'अभी कोई रिपोर्ट नहीं',
      analytics_title: 'नाइट सेफ्टी डैशबोर्ड', analytics_subtitle: 'मुंबई महानगर क्षेत्र · रियल-टाइम ज़ोन एनालिटिक्स', time_window: 'समय अवधि', risk_level: 'रिस्क स्तर',
      tw_night: 'रात (20:00–05:00)', tw_late: 'देर रात (23:00–03:00)', tw_all: 'सभी घंटे', all_levels: 'सभी स्तर', high_risk: 'उच्च रिस्क', medium_risk: 'मध्यम रिस्क', low_risk: 'कम रिस्क',
      about_title: 'Nuit Noire के बारे में', about_subtitle: 'डेटा साइंस और मशीन लर्निंग से मुंबई में रात का सफर सुरक्षित बनाना।',
      report_success_toast: 'घटना सफलतापूर्वक रिपोर्ट हो गई!', submission_failed: 'सबमिशन असफल', network_try_again: 'नेटवर्क त्रुटि — फिर कोशिश करें',
      admin_authenticated: 'एडमिन प्रमाणित', invalid_credentials: 'गलत क्रेडेंशियल्स', failed_load_reports: 'रिपोर्ट लोड नहीं हो सकीं', report_status_update: 'रिपोर्ट #{id} → {status}', update_failed: 'अपडेट असफल', submitting: 'जमा हो रहा है...',
      feature_lighting: 'रोशनी', feature_traffic: 'ट्रैफिक', feature_history: 'इतिहास', feature_time: 'समय', risk_label: '{level} जोखिम',
      kpi_total_zones: 'मॉनिटर किए गए कुल ज़ोन', kpi_high_risk: 'उच्च जोखिम ज़ोन', kpi_avg_score: 'औसत जोखिम स्कोर', kpi_peak_hour: 'सबसे खतरनाक समय',
      kpi_safest: 'सबसे सुरक्षित ज़ोन', kpi_dangerous: 'सबसे खतरनाक', highest_incident_rate: 'सबसे अधिक घटनाएं', lowest_risk_score: 'सबसे कम जोखिम स्कोर', highest_risk_score: 'सबसे अधिक जोखिम स्कोर',
      incidents: 'घटनाएं', accidents: 'दुर्घटनाएं', count: 'गिनती', risk_score_tooltip: 'रिस्क स्कोर: {score}',
    },
    mr: {
      lang_name_en: 'इंग्रजी', lang_name_hi: 'हिंदी', lang_name_mr: 'मराठी', lang_name_hinglish: 'हिंग्लिश',
      nav_home: 'मुख्यपृष्ठ', nav_explore: 'एक्सप्लोर', nav_predict: 'भाकीत', nav_analytics: 'विश्लेषण', nav_report: 'तक्रार', nav_about: 'माहिती',
      lang_aria: 'भाषा निवडा',
      home_h1: 'मुंबईच्या रात्री सुरक्षित प्रवास करा', home_subtitle: 'AI आधारित जोखीम विश्लेषण मुंबईतील 20 परिसर दाखवते आणि रात्री सुरक्षित मार्ग सुचवते।',
      home_btn_explore: 'नकाशा पाहा', home_btn_predict: 'AI भाकीत वापरा',
      predict_title: 'AI जोखीम भाकीत', predict_subtitle: 'आत्ता तुमचा परिसर किती सुरक्षित आहे ते पहा — लोकेशन आपोआप ओळखली जाते।',
      detecting_location: 'तुमचे लोकेशन शोधत आहे...', use_my_location: '📍 माझे लोकेशन वापरा', detect_my_location: '📍 माझे लोकेशन शोधा',
      neighborhood: '📍 परिसर', time_of_day: '🕐 वेळ', tune_optional: '⚙️ पर्याय बदला (ऐच्छिक)', lighting_level: '💡 प्रकाश पातळी',
      traffic_density: '🚗 वाहतूक घनता', accident_history: '⚠️ अपघात इतिहास', area_type: '📍 क्षेत्र प्रकार', submit_custom_predict: 'कस्टम पॅरामिटरने भाकीत करा', select_area_opt: '— तुमचा परिसर निवडा —',
      none0: 'नाही (0)', some1: 'काही (1)', high2: 'जास्त (2)', urban: 'शहरी', suburban: 'उपनगरी', rural: 'ग्रामीण',
      midnight: 'मध्यरात्र', noon: 'दुपार', pm11: 'रात्री 11', dark: 'अंधार', bright: 'उजेड', deserted: 'ओसाड', heavy: 'जास्त',
      located_near: 'तुम्ही {zone} जवळ आहात',
      report_title: 'घटना नोंदवा', report_subtitle: 'मुंबई सुरक्षित करण्यासाठी मदत करा — खराब लाईट, असुरक्षित रस्ता किंवा संशयास्पद हालचाल नोंदवा।',
      submit_report: 'तक्रार सादर करा', report_submitted: 'तक्रार सादर झाली!', report_thank_you: 'मुंबई सुरक्षित ठेवण्यास मदत केल्याबद्दल धन्यवाद।',
      location_name: 'ठिकाणाचे नाव', latitude_optional: 'अक्षांश (ऐच्छिक)', longitude_optional: 'रेखांश (ऐच्छिक)', issue_type: 'समस्या प्रकार', description: 'वर्णन',
      issue_select: '— समस्या निवडा —', issue_broken_light: '🔦 खराब रस्त्यावरील दिवा', issue_suspicious: '👁️ संशयास्पद हालचाल', issue_unsafe_road: '🚧 असुरक्षित रस्ता', issue_other: '📝 इतर',
      admin_dashboard: 'ॲडमिन डॅशबोर्ड', authorized_only: 'फक्त अधिकृत कर्मचाऱ्यांसाठी', username: 'वापरकर्तानाव', password: 'पासवर्ड', authenticate: 'प्रमाणित करा',
      total: 'एकूण', pending: 'प्रलंबित', investigating: 'तपास सुरू', resolved: 'निकाली', login_to_view_reports: 'अहवाल पाहण्यासाठी लॉगिन करा', no_reports_yet: 'अद्याप अहवाल नाहीत',
      analytics_title: 'रात्र सुरक्षा डॅशबोर्ड', analytics_subtitle: 'मुंबई महानगर क्षेत्र · रिअल-टाईम क्षेत्र विश्लेषण', time_window: 'वेळ विंडो', risk_level: 'जोखीम स्तर',
      tw_night: 'रात्र (20:00–05:00)', tw_late: 'उशीरा रात्र (23:00–03:00)', tw_all: 'सर्व तास', all_levels: 'सर्व स्तर', high_risk: 'उच्च जोखीम', medium_risk: 'मध्यम जोखीम', low_risk: 'कमी जोखीम',
      about_title: 'Nuit Noire बद्दल', about_subtitle: 'डेटा सायन्स आणि मशीन लर्निंगद्वारे मुंबईत रात्रीचा प्रवास अधिक सुरक्षित करणे।',
      report_success_toast: 'घटना यशस्वीरीत्या नोंदली!', submission_failed: 'सादर करणे अयशस्वी', network_try_again: 'नेटवर्क त्रुटी — पुन्हा प्रयत्न करा', admin_authenticated: 'ॲडमिन प्रमाणित', invalid_credentials: 'चुकीची माहिती', failed_load_reports: 'अहवाल लोड झाले नाहीत', report_status_update: 'अहवाल #{id} → {status}', update_failed: 'अपडेट अयशस्वी', submitting: 'सादर करत आहे...',
      feature_lighting: 'प्रकाश', feature_traffic: 'वाहतूक', feature_history: 'इतिहास', feature_time: 'वेळ', risk_label: '{level} जोखीम',
      kpi_total_zones: 'निरीक्षणाखालील एकूण क्षेत्रे', kpi_high_risk: 'उच्च जोखीम क्षेत्रे', kpi_avg_score: 'सरासरी जोखीम गुण', kpi_peak_hour: 'सर्वाधिक धोकादायक वेळ', kpi_safest: 'सर्वात सुरक्षित क्षेत्र', kpi_dangerous: 'सर्वात धोकादायक',
      highest_incident_rate: 'सर्वाधिक घटना दर', lowest_risk_score: 'सर्वात कमी जोखीम गुण', highest_risk_score: 'सर्वाधिक जोखीम गुण', incidents: 'घटना', accidents: 'अपघात', count: 'संख्या', risk_score_tooltip: 'जोखीम गुण: {score}',
    },
    hinglish: {
      lang_name_en: 'English', lang_name_hi: 'Hindi', lang_name_mr: 'Marathi', lang_name_hinglish: 'Hinglish',
      nav_home: 'Home', nav_explore: 'Explore', nav_predict: 'Predict', nav_analytics: 'Analytics', nav_report: 'Report', nav_about: 'About',
      lang_aria: 'Language select karo',
      home_h1: 'Mumbai ki raat mein safely travel karo', home_subtitle: 'AI risk intelligence Mumbai ke 20 areas map karke night mein safer routes suggest karta hai.',
      home_btn_explore: 'Map Explore karo', home_btn_predict: 'AI Predictor Try karo',
      predict_title: 'AI Risk Predictor', predict_subtitle: 'Abhi aapka area kitna safe hai dekho — location auto-detect hoti hai.',
      detecting_location: 'Aapki location detect ho rahi hai...', use_my_location: '📍 Meri Location Use karo', detect_my_location: '📍 Meri Location Detect karo',
      neighborhood: '📍 Neighborhood', time_of_day: '🕐 Time of Day', tune_optional: '⚙️ Parameters fine-tune karo (optional)',
      lighting_level: '💡 Lighting Level', traffic_density: '🚗 Traffic Density', accident_history: '⚠️ Accident History', area_type: '📍 Area Type',
      submit_custom_predict: 'Custom Parameters se Predict karo', select_area_opt: '— Apna area select karo —',
      none0: 'None (0)', some1: 'Thoda (1)', high2: 'High (2)', urban: 'Urban', suburban: 'Suburban', rural: 'Rural',
      midnight: 'Midnight', noon: 'Noon', pm11: '11 PM', dark: 'Dark', bright: 'Bright', deserted: 'Sunsaan', heavy: 'Heavy',
      located_near: 'Aap {zone} ke paas ho',
      report_title: 'Incident Report karo', report_subtitle: 'Mumbai ko safer banao — broken lights, unsafe roads ya suspicious activity report karo.',
      submit_report: 'Report Submit karo', report_submitted: 'Report Submit ho gaya!', report_thank_you: 'Mumbai safe rakhne mein help karne ke liye thanks.',
      location_name: 'Location Name', latitude_optional: 'Latitude (optional)', longitude_optional: 'Longitude (optional)', issue_type: 'Issue Type', description: 'Description',
      issue_select: '— Issue Select karo —', issue_broken_light: '🔦 Broken Street Light', issue_suspicious: '👁️ Suspicious Activity', issue_unsafe_road: '🚧 Unsafe Road Condition', issue_other: '📝 Other',
      admin_dashboard: 'Admin Dashboard', authorized_only: 'Sirf authorized logon ke liye', username: 'Username', password: 'Password', authenticate: 'Authenticate karo',
      total: 'Total', pending: 'Pending', investigating: 'Investigating', resolved: 'Resolved', login_to_view_reports: 'Reports dekhne ke liye login karo', no_reports_yet: 'Abhi tak koi report nahi',
      analytics_title: 'Night Safety Dashboard', analytics_subtitle: 'Mumbai metro area · Real-time zone analytics', time_window: 'Time Window', risk_level: 'Risk Level',
      tw_night: 'Night (20:00–05:00)', tw_late: 'Late Night (23:00–03:00)', tw_all: 'All Hours', all_levels: 'All Levels', high_risk: 'High Risk', medium_risk: 'Medium Risk', low_risk: 'Low Risk',
      about_title: 'Nuit Noire ke baare mein', about_subtitle: 'Data science aur machine learning ke through Mumbai mein safer night travel.',
      report_success_toast: 'Incident successfully report ho gaya!', submission_failed: 'Submission fail hua', network_try_again: 'Network issue — dobara try karo',
      admin_authenticated: 'Admin authenticated', invalid_credentials: 'Invalid credentials', failed_load_reports: 'Reports load nahi hue', report_status_update: 'Report #{id} → {status}', update_failed: 'Update fail hua', submitting: 'Submit ho raha hai...',
      feature_lighting: 'Lighting', feature_traffic: 'Traffic', feature_history: 'History', feature_time: 'Time', risk_label: '{level} Risk',
      kpi_total_zones: 'Total Zones Monitored', kpi_high_risk: 'High Risk Zones', kpi_avg_score: 'Avg Risk Score', kpi_peak_hour: 'Peak Danger Hour',
      kpi_safest: 'Safest Zone', kpi_dangerous: 'Most Dangerous', highest_incident_rate: 'Highest incident rate', lowest_risk_score: 'Lowest risk score', highest_risk_score: 'Highest risk score',
      incidents: 'Incidents', accidents: 'Accidents', count: 'Count', risk_score_tooltip: 'Risk Score: {score}',
    },
  };

  let currentLang = SUPPORTED.includes(localStorage.getItem(STORAGE_KEY)) ? localStorage.getItem(STORAGE_KEY) : 'en';

  function t(key, vars = {}) {
    const bundle = MESSAGES[currentLang] || MESSAGES.en;
    const fallback = MESSAGES.en[key] || key;
    let text = bundle[key] || fallback;
    Object.entries(vars).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    });
    return text;
  }

  function setText(sel, text) {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }

  function setLang(nextLang) {
    if (!SUPPORTED.includes(nextLang)) return;
    currentLang = nextLang;
    localStorage.setItem(STORAGE_KEY, nextLang);
    document.documentElement.lang = LANG_ATTR[nextLang] || 'en';
    applyStaticTranslations();
    window.dispatchEvent(new CustomEvent('nuit:lang-changed', { detail: { lang: nextLang } }));
  }

  function getLang() {
    return currentLang;
  }

  function applyStaticTranslations() {
    const navMap = {
      '/': 'nav_home', '/explore': 'nav_explore', '/predict': 'nav_predict',
      '/analytics': 'nav_analytics', '/report': 'nav_report', '/about': 'nav_about',
    };
    document.querySelectorAll('.nav-links a').forEach(a => {
      const key = navMap[a.getAttribute('href')];
      if (key) a.textContent = t(key);
    });

    const page = document.body.dataset.page;
    if (page === 'home') {
      setText('.hero-content h1', t('home_h1'));
      setText('.hero-content .subtitle', t('home_subtitle'));
      const heroBtns = document.querySelectorAll('.hero-actions .btn');
      if (heroBtns[0]) heroBtns[0].childNodes[heroBtns[0].childNodes.length - 1].textContent = ` ${t('home_btn_explore')}`;
      if (heroBtns[1]) heroBtns[1].textContent = t('home_btn_predict');
    }

    if (page === 'predict') {
      setText('.section-header h1', t('predict_title'));
      setText('.section-header p', t('predict_subtitle'));
      setText('#zone-picker-group .form-label', t('neighborhood'));
      setText('label[for="p-time"]', t('time_of_day'));
      setText('#p-locate-btn', t('use_my_location'));
      setText('.advanced-toggle summary', t('tune_optional'));
      const labels = document.querySelectorAll('#predict-form .form-label');
      if (labels[0]) labels[0].textContent = t('lighting_level');
      if (labels[1]) labels[1].textContent = t('traffic_density');
      if (labels[2]) labels[2].textContent = t('accident_history');
      if (labels[3]) labels[3].textContent = t('area_type');
      const btn = document.querySelector('#predict-form button[type="submit"]');
      if (btn) btn.textContent = t('submit_custom_predict');

      const hist = document.getElementById('p-history');
      if (hist && hist.options.length >= 3) {
        hist.options[0].text = t('none0');
        hist.options[1].text = t('some1');
        hist.options[2].text = t('high2');
      }
      const area = document.getElementById('p-area');
      if (area && area.options.length >= 3) {
        area.options[0].text = t('urban');
        area.options[1].text = t('suburban');
        area.options[2].text = t('rural');
      }
      const rangeLabels = document.querySelectorAll('.range-labels');
      if (rangeLabels[0]) rangeLabels[0].innerHTML = `<span>${t('midnight')}</span><span>${t('noon')}</span><span>${t('pm11')}</span>`;
      if (rangeLabels[1]) rangeLabels[1].innerHTML = `<span>${t('dark')}</span><span>${t('bright')}</span>`;
      if (rangeLabels[2]) rangeLabels[2].innerHTML = `<span>${t('deserted')}</span><span>${t('heavy')}</span>`;
      const placeholder = document.querySelector('#predict-result-box .placeholder-content p');
      if (placeholder) placeholder.textContent = t('detecting_location');
    }

    if (page === 'report') {
      setText('.section-header h1', t('report_title'));
      setText('.section-header p', t('report_subtitle'));
      setText('#report-success h3', t('report_submitted'));
      setText('#report-success p', t('report_thank_you'));
      const labels = document.querySelectorAll('#report-form .form-label');
      if (labels[0]) labels[0].textContent = t('location_name');
      if (labels[1]) labels[1].innerHTML = `${t('latitude_optional')}`;
      if (labels[2]) labels[2].innerHTML = `${t('longitude_optional')}`;
      if (labels[3]) labels[3].textContent = t('issue_type');
      if (labels[4]) labels[4].textContent = t('description');
      setText('#report-form button[type="submit"]', t('submit_report'));
      const issue = document.getElementById('r-issue');
      if (issue && issue.options.length >= 5) {
        issue.options[0].text = t('issue_select');
        issue.options[1].text = t('issue_broken_light');
        issue.options[2].text = t('issue_suspicious');
        issue.options[3].text = t('issue_unsafe_road');
        issue.options[4].text = t('issue_other');
      }
      setText('.card:nth-child(2) .card-title', t('admin_dashboard'));
      const p = document.querySelector('#admin-login-wrap p');
      if (p) p.textContent = t('authorized_only');
      const adminLabels = document.querySelectorAll('#admin-login-form .form-label');
      if (adminLabels[0]) adminLabels[0].textContent = t('username');
      if (adminLabels[1]) adminLabels[1].textContent = t('password');
      setText('#admin-login-form button[type="submit"]', t('authenticate'));
      const stats = document.querySelectorAll('.stat-card .label');
      if (stats[0]) stats[0].textContent = t('total');
      if (stats[1]) stats[1].textContent = t('pending');
      if (stats[2]) stats[2].textContent = t('investigating');
      if (stats[3]) stats[3].textContent = t('resolved');
      const loginRow = document.querySelector('#reports-tbody td[colspan="6"]');
      if (loginRow) loginRow.textContent = t('login_to_view_reports');
    }

    if (page === 'analytics') {
      setText('.dash-title', t('analytics_title'));
      setText('.dash-subtitle', t('analytics_subtitle'));
      const labels = document.querySelectorAll('.dash-filter-group label');
      if (labels[0]) labels[0].textContent = t('time_window');
      if (labels[1]) labels[1].textContent = t('risk_level');
      const timeSelect = document.getElementById('filter-time');
      if (timeSelect && timeSelect.options.length >= 3) {
        timeSelect.options[0].text = t('tw_night');
        timeSelect.options[1].text = t('tw_late');
        timeSelect.options[2].text = t('tw_all');
      }
      const riskSelect = document.getElementById('filter-risk');
      if (riskSelect && riskSelect.options.length >= 4) {
        riskSelect.options[0].text = t('all_levels');
        riskSelect.options[1].text = t('high_risk');
        riskSelect.options[2].text = t('medium_risk');
        riskSelect.options[3].text = t('low_risk');
      }
    }

    if (page === 'about') {
      setText('.section-header h1', t('about_title'));
      setText('.section-header p', t('about_subtitle'));
    }
  }

  function initSelector() {
    const navbar = document.querySelector('.navbar');
    const themeBtn = document.getElementById('theme-toggle');
    if (!navbar || !themeBtn || document.getElementById('lang-select')) return;

    const select = document.createElement('select');
    select.id = 'lang-select';
    select.className = 'lang-select';
    select.setAttribute('aria-label', t('lang_aria'));
    select.innerHTML = `
      <option value="en">${t('lang_name_en')}</option>
      <option value="hi">${t('lang_name_hi')}</option>
      <option value="mr">${t('lang_name_mr')}</option>
      <option value="hinglish">${t('lang_name_hinglish')}</option>
    `;
    select.value = currentLang;
    select.addEventListener('change', () => setLang(select.value));
    navbar.insertBefore(select, themeBtn);
  }

  function init() {
    document.documentElement.lang = LANG_ATTR[currentLang] || 'en';
    initSelector();
    applyStaticTranslations();
  }

  return { init, t, setLang, getLang, applyStaticTranslations };
})();

window.NuitI18n = NuitI18n;

/* ── DOMContentLoaded initializer ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  NuitI18n.init();
  initNavbar();
  initScrollReveal();
  initSliders();

  const page = document.body.dataset.page;
  if (page === 'home')      initHome();
  if (page === 'predict')   initPredict();
  if (page === 'report')    initReport();
  if (page === 'analytics') initAnalytics();
});

/* ══════════════════════════════════════════════════════════════════════════
   NAVBAR
   ══════════════════════════════════════════════════════════════════════════ */
function initNavbar() {
  const nav = document.querySelector('.navbar');
  const btn = document.querySelector('.hamburger');
  const links = document.querySelector('.nav-links');

  // Scroll effect
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }, { passive: true });
  }

  // Hamburger toggle
  if (btn && links) {
    btn.addEventListener('click', () => {
      btn.classList.toggle('open');
      links.classList.toggle('open');
    });
    document.addEventListener('click', e => {
      if (!btn.contains(e.target) && !links.contains(e.target)) {
        btn.classList.remove('open');
        links.classList.remove('open');
      }
    });
  }

  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    const saved = localStorage.getItem('nuit-theme');
    if (saved) {
      document.documentElement.setAttribute('data-theme', saved);
      themeBtn.textContent = saved === 'light' ? '☀️' : '🌙';
    }
    themeBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('nuit-theme', next);
      themeBtn.textContent = next === 'light' ? '☀️' : '🌙';
      // Switch map tiles
      if (typeof NuitMap !== 'undefined') NuitMap.setTheme(next);
      // Switch analytics mini map tiles
      if (window._analyticsTileLayer) {
        const url = next === 'light'
          ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
        window._analyticsTileLayer.setUrl(url);
      }
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SCROLL REVEAL
   ══════════════════════════════════════════════════════════════════════════ */
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  els.forEach(el => observer.observe(el));
}

/* ══════════════════════════════════════════════════════════════════════════
   RANGE SLIDERS
   ══════════════════════════════════════════════════════════════════════════ */
function initSliders() {
  document.querySelectorAll('input[type="range"]').forEach(slider => {
    const display = document.getElementById(slider.id + '-val');
    if (display) {
      display.textContent = slider.value;
      slider.addEventListener('input', () => { display.textContent = slider.value; });
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   HOME PAGE — Animated Counters + Particle Background
   ══════════════════════════════════════════════════════════════════════════ */
function initHome() {
  // Animated counters
  const counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    counters.forEach(el => observer.observe(el));
  }

  // Particle canvas
  const canvas = document.getElementById('hero-canvas');
  if (canvas) initParticles(canvas);
}

function animateCounter(el) {
  const target = el.dataset.count;
  const suffix = el.dataset.suffix || '';
  const isNum = !isNaN(parseFloat(target));
  if (!isNum) { el.textContent = target; return; }

  const end = parseFloat(target);
  const duration = 1800;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const val = Math.round(ease * end);
    el.textContent = val + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function initParticles(canvas) {
  const ctx = canvas.getContext('2d');
  let w, h, particles;
  const PARTICLE_COUNT = 80;
  const CONNECTION_DIST = 130;

  function isLight() {
    return document.documentElement.getAttribute('data-theme') === 'light';
  }

  function resize() {
    w = canvas.width = canvas.parentElement.offsetWidth;
    h = canvas.height = canvas.parentElement.offsetHeight;
  }

  function createParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: Math.random() * 1.8 + 0.4,
        twinkle: Math.random() * Math.PI * 2,       // phase offset for shimmer
        twinkleSpeed: 0.01 + Math.random() * 0.03,  // shimmer speed
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    const light = isLight();

    // Connections
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < CONNECTION_DIST) {
          const alpha = (1 - dist / CONNECTION_DIST) * (light ? 0.1 : 0.18);
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = light
            ? `rgba(99, 102, 241, ${alpha})`
            : `rgba(165, 180, 252, ${alpha})`;
          ctx.lineWidth = light ? 0.4 : 0.6;
          ctx.stroke();
        }
      }
    }

    // Particles
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      // Twinkle: oscillating brightness
      p.twinkle += p.twinkleSpeed;
      const shimmer = 0.5 + 0.5 * Math.sin(p.twinkle);

      if (light) {
        // Light theme: soft indigo dots
        const a = 0.2 + shimmer * 0.25;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.9, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(99, 102, 241, ${a})`;
        ctx.fill();
      } else {
        // Dark theme: glowing stars with soft halo
        const a = 0.4 + shimmer * 0.5;
        const glowR = p.r * (2.5 + shimmer * 1.5);
        // Outer glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowR, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(129, 140, 248, ${a * 0.08})`;
        ctx.fill();
        // Core
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(200, 210, 255, ${a})`;
        ctx.fill();
      }
    });

    requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();
  window.addEventListener('resize', () => { resize(); createParticles(); });
}

/* ══════════════════════════════════════════════════════════════════════════
   PREDICT PAGE — Zone-Based Prediction + Animated Gauge
   ══════════════════════════════════════════════════════════════════════════ */
let predictTimeout = null;
let predictZonesList = [];

function initPredict() {
  const zoneSel   = document.getElementById('p-zone');
  const timeSl    = document.getElementById('p-time');
  const resultBox = document.getElementById('predict-result-box');
  const locBtn    = document.getElementById('p-locate-btn');
  const advForm   = document.getElementById('predict-form');
  if (!zoneSel || !resultBox) return;

  // 1) Load zones into dropdown
  fetch('/api/zones-list')
    .then(r => r.json())
    .then(data => {
      predictZonesList = data.zones || [];
      zoneSel.innerHTML = '<option value="">— Select your area —</option>';
      predictZonesList.forEach(z => {
        const opt = document.createElement('option');
        opt.value = z.name;
        const dot = z.risk === 'high' ? '🔴' : z.risk === 'medium' ? '🟡' : '🟢';
        opt.textContent = `${dot} ${z.name}`;
        opt.dataset.lighting = z.lighting || '';
        opt.dataset.traffic = z.traffic || '';
        opt.dataset.accidents = z.accidents || '';
        opt.dataset.area = z.area || '';
        zoneSel.appendChild(opt);
      });

      // 2) Auto-detect location
      autoDetectLocation();
    });

  // Zone change → predict
  zoneSel.addEventListener('change', () => {
    updateSlidersFromZone();
    doZonePredict(resultBox);
  });

  // Time change → predict
  timeSl.addEventListener('input', () => {
    document.getElementById('p-time-val').textContent = timeSl.value;
    clearTimeout(predictTimeout);
    predictTimeout = setTimeout(() => doZonePredict(resultBox), 250);
  });

  // Locate button
  if (locBtn) {
    locBtn.addEventListener('click', () => autoDetectLocation());
  }

  // Advanced form still works
  if (advForm) {
    const inputs = advForm.querySelectorAll('input, select');
    inputs.forEach(inp => {
      inp.addEventListener('input', () => livePredictDebounced(resultBox));
      inp.addEventListener('change', () => livePredictDebounced(resultBox));
    });
    advForm.addEventListener('submit', e => {
      e.preventDefault();
      doPredict(resultBox);
    });
  }

  function autoDetectLocation() {
    if (!navigator.geolocation) return fallbackPredict();

    resultBox.innerHTML = '<div class="placeholder-content"><div class="placeholder-icon">📍</div><p>Detecting your location...</p></div>';

    navigator.geolocation.getCurrentPosition(
      pos => {
        const nearest = findNearestPredictZone(pos.coords.latitude, pos.coords.longitude);
        if (nearest) {
          zoneSel.value = nearest.name;
          updateSlidersFromZone();
          Nuit.toast(`Located near ${nearest.name}`, 'success');
          doZonePredict(resultBox);
        } else {
          fallbackPredict();
        }
      },
      () => fallbackPredict(),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }

  function fallbackPredict() {
    // Default to first zone or just do a manual prediction
    if (predictZonesList.length) {
      zoneSel.value = predictZonesList[0].name;
      updateSlidersFromZone();
      doZonePredict(resultBox);
    } else {
      doPredict(resultBox);
    }
  }

  function updateSlidersFromZone() {
    const zone = predictZonesList.find(z => z.name === zoneSel.value);
    if (!zone) return;
    const lightEl = document.getElementById('p-lighting');
    const traffEl = document.getElementById('p-traffic');
    const histEl  = document.getElementById('p-history');
    const areaEl  = document.getElementById('p-area');
    if (lightEl && zone.lighting !== undefined) { lightEl.value = zone.lighting; document.getElementById('p-lighting-val').textContent = zone.lighting; }
    if (traffEl && zone.traffic !== undefined)  { traffEl.value = zone.traffic;  document.getElementById('p-traffic-val').textContent = zone.traffic; }
    if (histEl && zone.accidents !== undefined)  { histEl.value = zone.accidents; }
    if (areaEl && zone.area)                     { areaEl.value = zone.area; }
  }
}

function findNearestPredictZone(lat, lng) {
  let best = null, bestDist = Infinity;
  predictZonesList.forEach(z => {
    const d = Math.sqrt((z.lat - lat) ** 2 + (z.lng - lng) ** 2);
    if (d < bestDist) { bestDist = d; best = z; }
  });
  return best;
}

async function doZonePredict(container) {
  const zoneSel = document.getElementById('p-zone');
  const timeEl  = document.getElementById('p-time');
  if (!zoneSel || !zoneSel.value) return;

  try {
    const res = await fetch('/api/zone-predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zone: zoneSel.value, time: parseInt(timeEl.value, 10) }),
    });
    const data = await res.json();
    if (data.error) { Nuit.toast(data.error, 'error'); return; }
    renderGaugeResult(data, container, zoneSel.value);
  } catch {
    // silent
  }
}

function livePredictDebounced(el) {
  clearTimeout(predictTimeout);
  predictTimeout = setTimeout(() => doPredict(el), 250);
}

async function doPredict(container) {
  const payload = {
    lighting_level: parseFloat(document.getElementById('p-lighting').value),
    traffic_density: parseFloat(document.getElementById('p-traffic').value),
    accident_history: parseInt(document.getElementById('p-history').value, 10),
    area_type: document.getElementById('p-area').value,
    time: parseInt(document.getElementById('p-time').value, 10),
  };

  try {
    const res = await fetch('/api/predict-risk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    renderGaugeResult(data, container);
  } catch {
    // Silently fail for live updates
  }
}

function renderGaugeResult(data, container, zoneName) {
  const lvl = data.risk_level.toLowerCase();
  const colors = { low: '#34d399', medium: '#fbbf24', high: '#f87171' };
  const color = colors[lvl] || '#818cf8';

  const zoneLabel = zoneName ? `<div class="gauge-zone-name">📍 ${Nuit.escapeHtml(zoneName)}</div>` : '';

  container.innerHTML = `
    <div class="gauge-wrap">
      ${zoneLabel}
      <div class="gauge-canvas-container">
        <canvas id="gauge-canvas" width="220" height="220"></canvas>
        <div class="gauge-center">
          <div class="gauge-score ${lvl}">${data.risk_score}%</div>
          <div class="gauge-label">${data.risk_level} Risk</div>
        </div>
      </div>
      <div style="margin-bottom:1rem">
        <span class="badge badge-${lvl}">${data.risk_level}</span>
      </div>
      <div class="predict-reasons-wrap">
        <ul class="reasons-list">
          ${data.reasons.map((r, i) => `<li style="animation-delay:${i * 0.1}s">${r}</li>`).join('')}
        </ul>
      </div>
      <div class="feature-bars" id="feature-bars"></div>
    </div>
  `;

  drawGauge('gauge-canvas', data.risk_score, color);
  renderFeatureBars();
}

function drawGauge(canvasId, score, color) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const cx = 110, cy = 110, r = 90;
  const startAngle = 0.75 * Math.PI;
  const endAngle = 2.25 * Math.PI;
  const range = endAngle - startAngle;

  ctx.clearRect(0, 0, 220, 220);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(99, 102, 241, 0.08)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Animated value arc
  const valueAngle = startAngle + (score / 100) * range;

  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, valueAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Glow
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, valueAngle);
  ctx.strokeStyle = color + '30';
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function renderFeatureBars() {
  const container = document.getElementById('feature-bars');
  if (!container) return;

  const lightingEl = document.getElementById('p-lighting');
  const trafficEl = document.getElementById('p-traffic');
  const historyEl = document.getElementById('p-history');
  const timeEl = document.getElementById('p-time');
  if (!lightingEl || !trafficEl || !historyEl || !timeEl) return;

  const features = [
    { label: 'Lighting', val: parseFloat(lightingEl.value) },
    { label: 'Traffic', val: parseFloat(trafficEl.value) },
    { label: 'History', val: parseInt(historyEl.value) / 2 },
    { label: 'Time', val: parseInt(timeEl.value) / 23 },
  ];

  container.innerHTML = features.map(f => `
    <div class="feature-bar-item">
      <span class="feature-bar-label">${f.label}</span>
      <div class="feature-bar-track">
        <div class="feature-bar-fill" style="width:${Math.round(f.val * 100)}%"></div>
      </div>
    </div>
  `).join('');
}

/* ══════════════════════════════════════════════════════════════════════════
   REPORT PAGE
   ══════════════════════════════════════════════════════════════════════════ */
function initReport() {
  const form = document.getElementById('report-form');
  const successEl = document.getElementById('report-success');

  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span> Submitting...';

      const payload = {
        location: document.getElementById('r-location').value.trim(),
        latitude: parseFloat(document.getElementById('r-lat').value) || null,
        longitude: parseFloat(document.getElementById('r-lng').value) || null,
        issue_type: document.getElementById('r-issue').value,
        description: document.getElementById('r-desc').value.trim(),
      };

      try {
        const res = await fetch('/api/report-incident', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.ok) {
          form.style.display = 'none';
          if (successEl) successEl.classList.add('visible');
          Nuit.toast('Incident reported successfully!', 'success');
          setTimeout(() => {
            form.reset();
            form.style.display = '';
            if (successEl) successEl.classList.remove('visible');
          }, 4000);
        } else {
          Nuit.toast(data.error || 'Submission failed', 'error');
        }
      } catch {
        Nuit.toast('Network error — try again', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = 'Submit Report';
      }
    });
  }

  // Admin
  const loginForm = document.getElementById('admin-login-form');
  const adminPanel = document.getElementById('admin-panel');

  if (loginForm) {
    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      const user = document.getElementById('a-user').value.trim();
      const pass = document.getElementById('a-pass').value;
      if (user === 'admin' && pass === 'nuitnoire2026') {
        loginForm.parentElement.style.display = 'none';
        adminPanel.style.display = 'block';
        loadReports();
        Nuit.toast('Admin authenticated', 'success');
      } else {
        Nuit.toast('Invalid credentials', 'error');
      }
    });
  }
}

async function loadReports() {
  try {
    const res = await fetch('/api/admin/reports');
    const data = await res.json();
    renderAdminStats(data);
    renderReportsTable(data.reports);
  } catch {
    Nuit.toast('Failed to load reports', 'error');
  }
}

function renderAdminStats(data) {
  const reports = data.reports || [];
  document.getElementById('stat-total').textContent = reports.length;
  document.getElementById('stat-pending').textContent = reports.filter(r => r.status === 'pending').length;
  document.getElementById('stat-investigating').textContent = reports.filter(r => r.status === 'investigating').length;
  document.getElementById('stat-resolved').textContent = reports.filter(r => r.status === 'resolved').length;
}

function renderReportsTable(reports) {
  const tbody = document.getElementById('reports-tbody');
  if (!tbody) return;

  if (!reports.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:2rem">No reports yet</td></tr>';
    return;
  }

  tbody.innerHTML = reports.map(r => `
    <tr>
      <td style="font-variant-numeric:tabular-nums">#${r.id}</td>
      <td>${Nuit.escapeHtml(r.location)}</td>
      <td>${r.issue_type.replace('_', ' ')}</td>
      <td style="font-variant-numeric:tabular-nums">${r.timestamp ? new Date(r.timestamp).toLocaleDateString() : '—'}</td>
      <td><span class="badge badge-${r.status}">${r.status}</span></td>
      <td>
        <select class="form-control" onchange="updateReportStatus(${r.id}, this.value)"
          style="font-size:0.72rem;padding:0.25rem 0.5rem;min-width:110px">
          <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="investigating" ${r.status === 'investigating' ? 'selected' : ''}>Investigating</option>
          <option value="resolved" ${r.status === 'resolved' ? 'selected' : ''}>Resolved</option>
        </select>
      </td>
    </tr>
  `).join('');
}

async function updateReportStatus(id, status) {
  try {
    await fetch('/api/admin/update-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    Nuit.toast(`Report #${id} → ${status}`, 'success');
    loadReports();
  } catch {
    Nuit.toast('Update failed', 'error');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   ANALYTICS PAGE — Professional Dashboard with KPIs, Donuts, Map, Charts
   ══════════════════════════════════════════════════════════════════════════ */
function initAnalytics() {
  // Load all data
  Promise.all([
    fetch('/api/insights-data').then(r => r.json()),
    fetch('/api/risk-zones').then(r => r.json()),
  ]).then(([data, zonesData]) => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    Chart.defaults.color = isLight ? '#475569' : '#94a3b8';
    Chart.defaults.borderColor = isLight ? 'rgba(99,102,241,0.08)' : 'rgba(99,102,241,0.06)';
    Chart.defaults.font.family = 'Inter, sans-serif';

    // KPIs
    buildKPIRow(data.kpis, data.sparklines);

    // Donut charts
    buildRiskDonut(data.risk_distribution, data.kpis);
    buildLightingDonut(data.lighting_distribution, data.kpis);

    // Main charts
    buildHourlyChart(data.hourly_trend);
    buildZonesHorizontalBar(data.risk_by_zone);
    buildLightingChart(data.accidents_by_lighting);
    buildTrafficChart(data.traffic_vs_risk);
    buildAreaChart(data.area_distribution);

    // Zone rankings
    buildZoneRankings(zonesData.zones);

    // Mini map
    initAnalyticsMap(zonesData.zones);
  });
}

/* ── KPI Row ───────────────────────────────────────────────────────────── */
function buildKPIRow(kpis, sparklines) {
  const row = document.getElementById('kpi-row');
  if (!row) return;

  const cards = [
    {
      label: 'Total Zones Monitored',
      value: kpis.total_zones,
      icon: '📍',
      color: 'accent',
      change: '+3',
      changeDir: 'up',
      spark: sparklines.incidents,
    },
    {
      label: 'High Risk Zones',
      value: kpis.high_risk,
      icon: '🔴',
      color: 'danger',
      change: '▼2 from last month',
      changeDir: 'down-good',
      spark: sparklines.high_risk,
    },
    {
      label: 'Avg Risk Score',
      value: kpis.avg_score,
      suffix: '%',
      icon: '📊',
      color: 'warning',
      change: '▼4.2% YoY',
      changeDir: 'down-good',
      spark: sparklines.avg_score,
    },
    {
      label: 'Peak Danger Hour',
      value: kpis.peak_hour_label,
      icon: '🕐',
      color: 'danger',
      change: 'Highest incident rate',
      changeDir: 'neutral',
    },
    {
      label: 'Safest Zone',
      value: kpis.safest_zone,
      icon: '🟢',
      color: 'success',
      change: 'Lowest risk score',
      changeDir: 'neutral',
    },
    {
      label: 'Most Dangerous',
      value: kpis.most_dangerous,
      icon: '⚠️',
      color: 'danger',
      change: 'Highest risk score',
      changeDir: 'neutral',
    },
  ];

  row.innerHTML = cards.map((c, i) => `
    <div class="kpi-card kpi-${c.color}" style="animation-delay:${i * 0.06}s">
      <div class="kpi-top">
        <span class="kpi-icon">${c.icon}</span>
        <span class="kpi-change ${c.changeDir}">${c.change}</span>
      </div>
      <div class="kpi-value">${c.value}${c.suffix || ''}</div>
      <div class="kpi-label">${c.label}</div>
      ${c.spark ? `<canvas class="kpi-spark" id="spark-${i}" width="120" height="32"></canvas>` : ''}
    </div>
  `).join('');

  // Draw sparklines
  cards.forEach((c, i) => {
    if (c.spark) drawSparkline(`spark-${i}`, c.spark, c.color);
  });
}

function drawSparkline(canvasId, data, colorName) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);

  const colors = {
    accent: '#818cf8', danger: '#f87171', warning: '#fbbf24',
    success: '#34d399',
  };
  const color = colors[colorName] || '#818cf8';

  // Fill area
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = color + '18';
  ctx.fill();

  // Stroke
  ctx.beginPath();
  data.forEach((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Last point dot
  const lastX = (data.length - 1) * step;
  const lastY = h - ((data[data.length - 1] - min) / range) * (h - 4) - 2;
  ctx.beginPath();
  ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/* ── Risk Distribution Donut ───────────────────────────────────────────── */
function buildRiskDonut(d, kpis) {
  const ctx = document.getElementById('chart-risk-donut');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.values,
        backgroundColor: ['#f87171', '#fbbf24', '#34d399'],
        borderWidth: 0, spacing: 3, borderRadius: 3,
        hoverOffset: 8,
      }],
    },
    options: donutOpts(),
  });

  // Legend
  const legend = document.getElementById('risk-donut-legend');
  if (legend) {
    const colors = ['#f87171', '#fbbf24', '#34d399'];
    const pct = d.values.map(v => Math.round(v / kpis.total_zones * 100));
    legend.innerHTML = d.labels.map((l, i) =>
      `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${colors[i]}"></span>
        <span class="donut-legend-label">${l}</span>
        <span class="donut-legend-value">${pct[i]}%</span>
      </div>`
    ).join('');
  }
}

/* ── Lighting Donut ────────────────────────────────────────────────────── */
function buildLightingDonut(d, kpis) {
  const ctx = document.getElementById('chart-lighting-donut');
  if (!ctx) return;

  const colors = ['#ef4444', '#f97316', '#fbbf24', '#34d399', '#22d3ee'];

  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.values,
        backgroundColor: colors,
        borderWidth: 0, spacing: 2, borderRadius: 3,
        hoverOffset: 6,
      }],
    },
    options: donutOpts(),
  });

  const legend = document.getElementById('lighting-donut-legend');
  if (legend) {
    legend.innerHTML = d.labels.map((l, i) =>
      `<div class="donut-legend-item">
        <span class="donut-legend-dot" style="background:${colors[i]}"></span>
        <span class="donut-legend-label">${l}</span>
        <span class="donut-legend-value">${d.values[i]}</span>
      </div>`
    ).join('');
  }
}

function donutOpts() {
  return {
    responsive: true,
    maintainAspectRatio: true,
    cutout: '68%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(12,12,28,0.95)',
        titleFont: { weight: '600' },
        padding: 10, cornerRadius: 8,
        borderColor: 'rgba(99,102,241,0.2)', borderWidth: 1,
      },
    },
  };
}

/* ── Zones Horizontal Bar ──────────────────────────────────────────────── */
function buildZonesHorizontalBar(d) {
  const ctx = document.getElementById('chart-zones-bar');
  if (!ctx) return;

  const bgColors = d.risks.map(r =>
    r === 'high' ? 'rgba(248,113,113,0.7)' :
    r === 'medium' ? 'rgba(251,191,36,0.7)' :
    'rgba(52,211,153,0.7)'
  );
  const borderColors = d.risks.map(r =>
    r === 'high' ? '#f87171' :
    r === 'medium' ? '#fbbf24' :
    '#34d399'
  );

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.scores,
        backgroundColor: bgColors,
        borderColor: borderColors,
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(12,12,28,0.95)',
          padding: 10, cornerRadius: 8,
          callbacks: {
            label: (item) => `Risk Score: ${item.raw}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true, max: 100,
          grid: { color: 'rgba(99,102,241,0.04)' },
          ticks: { font: { size: 10 } },
        },
        y: {
          grid: { display: false },
          ticks: { font: { size: 11, weight: '500' } },
        },
      },
    },
  });
}

/* ── Hourly Trend (area line) ──────────────────────────────────────────── */
function buildHourlyChart(d) {
  const ctx = document.getElementById('chart-hourly');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.values,
        borderColor: '#818cf8',
        backgroundColor: 'rgba(129, 140, 248, 0.1)',
        fill: true, tension: 0.4,
        pointBackgroundColor: '#818cf8',
        pointBorderColor: '#030308',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 7,
        borderWidth: 2.5,
      }],
    },
    options: chartOpts('Incidents'),
  });
}

function buildLightingChart(d) {
  const ctx = document.getElementById('chart-lighting');
  if (!ctx) return;

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.values,
        backgroundColor: 'rgba(248, 113, 113, 0.6)',
        borderColor: 'rgba(248, 113, 113, 0.8)',
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: chartOpts('Accidents'),
  });
}

function buildTrafficChart(d) {
  const ctx = document.getElementById('chart-traffic');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: d.labels,
      datasets: [
        { label: 'High', data: d.high, backgroundColor: 'rgba(248,113,113,0.65)', borderRadius: 4 },
        { label: 'Medium', data: d.medium, backgroundColor: 'rgba(251,191,36,0.65)', borderRadius: 4 },
        { label: 'Low', data: d.low, backgroundColor: 'rgba(52,211,153,0.65)', borderRadius: 4 },
      ],
    },
    options: {
      ...chartOpts('Count', true),
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(99,102,241,0.04)' } },
      },
    },
  });
}

function buildAreaChart(d) {
  const ctx = document.getElementById('chart-area');
  if (!ctx) return;
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: d.labels,
      datasets: [{
        data: d.high,
        backgroundColor: ['#f87171', '#fbbf24', '#34d399'],
        borderWidth: 0, spacing: 4, borderRadius: 4,
      }],
    },
    options: {
      responsive: true, cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: 'rgba(12,12,28,0.95)',
          padding: 10, cornerRadius: 8,
        },
      },
    },
  });
}

function chartOpts(yLabel, showLegend = false) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: showLegend,
        position: 'top',
        labels: { boxWidth: 10, padding: 10, font: { size: 10 } },
      },
      tooltip: {
        backgroundColor: 'rgba(12,12,28,0.95)',
        titleFont: { weight: '600' },
        padding: 10, cornerRadius: 8,
        borderColor: 'rgba(99,102,241,0.2)', borderWidth: 1,
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: 'rgba(99,102,241,0.04)' }, ticks: { font: { size: 10 } } },
    },
  };
}

/* ── Zone Rankings ─────────────────────────────────────────────────────── */
function buildZoneRankings(zones) {
  const container = document.getElementById('zone-rankings');
  if (!container) return;

  const sorted = [...zones].sort((a, b) => b.score - a.score);
  container.innerHTML = `<div class="zone-rank-list">${sorted.map((z, i) => `
    <div class="zone-rank-row">
      <span class="zone-rank-num">${i + 1}</span>
      <span class="zone-rank-dot" style="background:${
        z.risk === 'high' ? '#f87171' : z.risk === 'medium' ? '#fbbf24' : '#34d399'
      }"></span>
      <span class="zone-rank-name">${z.name}</span>
      <div class="zone-rank-bar-track">
        <div class="zone-rank-bar-fill ${z.risk}" style="width:${z.score}%"></div>
      </div>
      <span class="zone-rank-score" style="color:${
        z.risk === 'high' ? '#f87171' : z.risk === 'medium' ? '#fbbf24' : '#34d399'
      }">${z.score}</span>
    </div>
  `).join('')}</div>`;
}

/* ── Analytics Mini Map ────────────────────────────────────────────────── */
function initAnalyticsMap(zones) {
  const mapEl = document.getElementById('analytics-map');
  if (!mapEl) return;

  const map = L.map('analytics-map', {
    center: [19.076, 72.8777],
    zoom: 11,
    zoomControl: false,
    attributionControl: false,
  });

  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const tileUrl = isLight
    ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  window._analyticsTileLayer = L.tileLayer(tileUrl, {
    maxZoom: 18,
  }).addTo(map);

  zones.forEach(z => {
    const color = z.risk === 'high' ? '#f87171' : z.risk === 'medium' ? '#fbbf24' : '#34d399';
    const radius = z.risk === 'high' ? 900 : z.risk === 'medium' ? 700 : 500;
    L.circle([z.lat, z.lng], {
      radius: radius,
      color: color,
      fillColor: color,
      fillOpacity: 0.25,
      weight: 1.5,
      opacity: 0.6,
    }).addTo(map).bindPopup(`<strong>${z.name}</strong><br>Risk: ${z.score}/100`);
  });
}
