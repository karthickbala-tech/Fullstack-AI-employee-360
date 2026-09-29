'use strict';

document.addEventListener('DOMContentLoaded', () => {
  let activeEmployeeId = window.AppConfig.tenant.defaultEmployeeId || 'OWN01';
  let cachedCanonical = null;

  // DOM Elements
  const empInput = document.getElementById('empIdInput');
  const fetchBtn = document.getElementById('fetchEmpBtn');
  const browseDirectoryBtn = document.getElementById('browseDirectoryBtn');
  const backendSelect = document.getElementById('backendSelect');
  const activeBackendDisplay = document.getElementById('activeBackendDisplay');
  const healthBadge = document.getElementById('healthBadge');
  const rawModal = document.getElementById('rawJsonModal');
  const rawContent = document.getElementById('rawJsonContent');
  const rawEndpoint = document.getElementById('rawJsonEndpoint');

  // Live Sync elements
  const openZohoConnectBtn = document.getElementById('openZohoConnectBtn');
  const zohoLiveDot = document.getElementById('zohoLiveDot');
  const zohoLiveLabel = document.getElementById('zohoLiveLabel');
  const liveSyncNotice = document.getElementById('liveSyncNotice');
  const liveNoticeTitle = document.getElementById('liveNoticeTitle');
  const liveSyncMessage = document.getElementById('liveSyncMessage');
  const noticeActionBtn = document.getElementById('noticeActionBtn');

  // Modals
  const zohoConnectModal = document.getElementById('zohoConnectModal');
  const closeZohoConnectBtn = document.getElementById('closeZohoConnectBtn');
  const zohoTokenInput = document.getElementById('zohoTokenInput');
  const zohoDcSelect = document.getElementById('zohoDcSelect');
  const saveZohoTokenBtn = document.getElementById('saveZohoTokenBtn');
  const clearZohoTokenBtn = document.getElementById('clearZohoTokenBtn');
  const zohoConnectStatusBox = document.getElementById('zohoConnectStatusBox');

  const directoryModal = document.getElementById('directoryModal');
  const closeDirectoryBtn = document.getElementById('closeDirectoryBtn');
  const directoryListContainer = document.getElementById('directoryListContainer');

  // Token helper functions
  function getZohoToken() {
    return localStorage.getItem('zoho_people_access_token') || '';
  }
  function setZohoToken(token) {
    if (token && token.trim()) {
      localStorage.setItem('zoho_people_access_token', token.trim());
    } else {
      localStorage.removeItem('zoho_people_access_token');
    }
  }
  function getZohoDataCenter() {
    return localStorage.getItem('zoho_people_datacenter') || 'in';
  }
  function setZohoDataCenter(dc) {
    localStorage.setItem('zoho_people_datacenter', dc || 'in');
  }

  // Auto-detect environment on initial load
  if (backendSelect) {
    const isZohoOrigin = window.location.hostname.includes('zoho') || window.location.hostname.includes('zohostatic');
    backendSelect.value = isZohoOrigin ? 'cloud' : 'local';
  }

  function getActiveBackend() {
    if (backendSelect && backendSelect.value === 'local') {
      return window.AppConfig.localBackendUrl;
    }
    return window.AppConfig.cloudBackendUrl;
  }

  function updateBackendBadge() {
    const active = getActiveBackend();
    if (activeBackendDisplay) {
      const isCloud = active.includes('catalystserverless.in');
      activeBackendDisplay.textContent = isCloud ? 'Catalyst Cloud (Serverless)' : 'Local Dev Proxy';
      activeBackendDisplay.className = isCloud ? 'badge-tag badge-cloud' : 'badge-tag badge-portal';
    }
    checkHealth();
  }

  if (backendSelect) {
    backendSelect.addEventListener('change', () => {
      updateBackendBadge();
      loadAllData();
    });
  }

  function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    const token = getZohoToken();
    const dc = getZohoDataCenter();
    if (token) {
      headers['x-zoho-auth-token'] = token;
      headers['Authorization'] = `Zoho-oauthtoken ${token}`;
    }
    headers['x-zoho-datacenter'] = dc;
    return headers;
  }

  // Resilient API request wrapper with Zoho auth headers & failover
  async function requestApi(endpointName, ...args) {
    const primaryBase = getActiveBackend();
    const primaryUrl = window.AppConfig.endpoints[endpointName](primaryBase, ...args);
    const headers = getAuthHeaders();

    try {
      const res = await fetch(primaryUrl, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (primaryErr) {
      console.warn(`[App] Request to ${primaryBase} failed. Trying fallback...`);
      const altBase = primaryBase === window.AppConfig.cloudBackendUrl
        ? window.AppConfig.localBackendUrl
        : window.AppConfig.cloudBackendUrl;
      const altUrl = window.AppConfig.endpoints[endpointName](altBase, ...args);

      try {
        const altRes = await fetch(altUrl, { headers });
        if (!altRes.ok) throw new Error(`HTTP ${altRes.status}`);
        const altJson = await altRes.json();
        if (backendSelect) {
          backendSelect.value = altBase === window.AppConfig.localBackendUrl ? 'local' : 'cloud';
          updateBackendBadge();
        }
        return altJson;
      } catch (fallbackErr) {
        throw primaryErr;
      }
    }
  }

  // Resilient POST request wrapper
  async function postApi(endpointName, payload, ...args) {
    const primaryBase = getActiveBackend();
    const primaryUrl = window.AppConfig.endpoints[endpointName](primaryBase, ...args);
    const headers = getAuthHeaders();

    try {
      const res = await fetch(primaryUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (primaryErr) {
      const altBase = primaryBase === window.AppConfig.cloudBackendUrl
        ? window.AppConfig.localBackendUrl
        : window.AppConfig.cloudBackendUrl;
      const altUrl = window.AppConfig.endpoints[endpointName](altBase, ...args);

      const altRes = await fetch(altUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!altRes.ok) throw new Error(`HTTP ${altRes.status}`);
      return await altRes.json();
    }
  }

  // Check backend health
  async function checkHealth() {
    try {
      const json = await requestApi('health');
      if (json.success && json.data?.status === 'UP') {
        healthBadge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#34d399;margin-right:6px;"></span><span>Catalyst Online</span>';
        healthBadge.style.color = '#34d399';
      } else {
        healthBadge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-right:6px;"></span><span>Degraded</span>';
        healthBadge.style.color = '#f59e0b';
      }
    } catch (err) {
      healthBadge.innerHTML = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f87171;margin-right:6px;"></span><span>Offline</span>';
      healthBadge.style.color = '#f87171';
    }
  }

  // Check Zoho People Live Connection Status
  async function checkZohoStatus() {
    try {
      const json = await requestApi('zohoStatus');
      if (json.success && json.data?.connected) {
        zohoLiveDot.style.background = '#34d399';
        zohoLiveLabel.textContent = `Zoho People: Live Synced (${json.data.activeRecordsCount || 0} records)`;
        return true;
      } else {
        zohoLiveDot.style.background = '#f59e0b';
        zohoLiveLabel.textContent = 'Zoho People: Connect Token';
        return false;
      }
    } catch (err) {
      zohoLiveDot.style.background = '#f87171';
      zohoLiveLabel.textContent = 'Zoho People: Offline';
      return false;
    }
  }

  // Tabs
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      const target = link.dataset.tab;
      tabLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');

      tabPanes.forEach(pane => {
        pane.style.display = pane.id === `pane-${target}` ? 'block' : 'none';
      });

      if (target === 'summary') fetchSummary();
      if (target === 'insights') fetchInsights();
      if (target === 'timeline') fetchTimeline();
    });
  });

  // Load All Data
  async function loadAllData() {
    activeEmployeeId = (empInput.value || 'OWN01').trim();
    empInput.value = activeEmployeeId;

    await fetchCanonical360();
  }

  // 1. Canonical 360 (Strict Real-Time Data Only - Zero Mock Data)
  async function fetchCanonical360() {
    const badgeSource = document.getElementById('badgeProfileSource');
    try {
      const json = await requestApi('employee360', activeEmployeeId);
      cachedCanonical = json;

      if (json.success && json.data) {
        const d = json.data;

        // If no live record found in Zoho People, display clean notification and clear fields
        if (d.isLiveZohoData === false) {
          liveNoticeTitle.textContent = 'Zoho People Real-Time Sync:';
          liveSyncMessage.textContent = d.limitations?.[0] || `Employee "${activeEmployeeId}" has no live record in Zoho People. Please check the employee ID or connect your live OAuth token.`;
          liveSyncNotice.style.display = 'flex';
          liveSyncNotice.style.borderColor = '#f59e0b';

          if (badgeSource) {
            badgeSource.textContent = 'Unsynced';
            badgeSource.className = 'badge-tag badge-portal';
          }

          // ZERO MOCK DATA - Display em-dash or Unassigned
          document.getElementById('metricTenure').textContent = '—';
          document.getElementById('metricAttendance').textContent = '—';
          document.getElementById('metricLeave').textContent = '—';
          document.getElementById('metricRating').textContent = '—';

          document.getElementById('fieldFullName').textContent = '—';
          document.getElementById('fieldEmail').textContent = '—';
          document.getElementById('fieldJobTitle').textContent = '—';
          document.getElementById('fieldLocation').textContent = '—';
          document.getElementById('fieldDept').textContent = '—';
          document.getElementById('fieldManager').textContent = '—';
          document.getElementById('fieldDoj').textContent = '—';
          document.getElementById('fieldStatus').textContent = 'Not Synced';

          document.getElementById('evidenceCount').textContent = '0 Source Records';
          document.getElementById('evidenceList').innerHTML = `
            <div style="background:rgba(239,68,68,0.1); border:1px solid #ef4444; border-radius:8px; padding:0.85rem; color:#fca5a5; font-size:0.8rem; line-height:1.5;">
              <strong>Live Zoho Record Missing:</strong> ${d.limitations?.[0] || 'No live data record found in Zoho People.'}
              <div style="margin-top:0.4rem; color:#cbd5e1;">Click <strong>"Connect Zoho People"</strong> above or <strong>"Browse Live Directory"</strong> to select a verified employee.</div>
            </div>
          `;
          return;
        }

        // Live record is verified and present
        liveSyncNotice.style.display = 'none';

        if (badgeSource) {
          badgeSource.textContent = 'Live Zoho Record';
          badgeSource.className = 'badge-tag badge-cloud';
        }

        // Populate metrics exclusively from real Zoho People fields
        document.getElementById('metricTenure').textContent = d.deterministicMetrics?.tenure?.formatted || '—';
        document.getElementById('metricAttendance').textContent = d.attendance?.attendancePercentage
          ? `${d.attendance.attendancePercentage}%`
          : (d.deterministicMetrics?.attendancePercentage?.formatted || '—');
        document.getElementById('metricLeave').textContent = d.leave?.balance?.length
          ? `${d.leave.balance.reduce((acc, c) => acc + (c.taken || 0), 0)} days taken`
          : '—';
        document.getElementById('metricRating').textContent = d.performance?.overallRating !== null && d.performance?.overallRating !== undefined
          ? d.performance.overallRating
          : '—';

        // Profile details directly from Zoho People Form API
        document.getElementById('fieldFullName').textContent = d.employee?.fullName || 'Unspecified';
        document.getElementById('fieldEmail').textContent = d.employee?.email || 'Unspecified';
        document.getElementById('fieldJobTitle').textContent = d.employment?.jobTitle || 'Unassigned';
        document.getElementById('fieldLocation').textContent = d.employment?.workLocation || 'Unassigned';
        document.getElementById('fieldDept').textContent = d.organisation?.department || 'Unassigned';
        document.getElementById('fieldManager').textContent = d.organisation?.reportingManagerName || 'Unassigned';
        document.getElementById('fieldDoj').textContent = d.employment?.dateOfJoining || '—';
        document.getElementById('fieldStatus').textContent = d.employment?.employmentStatus || 'Active';

        // Evidence list
        const evList = document.getElementById('evidenceList');
        evList.innerHTML = '';
        const evidence = Array.isArray(d.evidence) ? d.evidence : [];
        document.getElementById('evidenceCount').textContent = `${evidence.length} Verified Records`;

        if (evidence.length === 0) {
          evList.innerHTML = '<div style="color:#94a3b8; font-style:italic; padding:0.5rem 0;">No fields returned in Zoho People record.</div>';
        } else {
          evidence.forEach(ev => {
            const div = document.createElement('div');
            div.style.cssText = 'background:rgba(15,23,42,0.6); border:1px solid #334155; border-radius:8px; padding:0.6rem; margin-bottom:0.5rem; font-size:0.8rem;';
            div.innerHTML = `
              <div style="display:flex; justify-content:space-between; margin-bottom:0.25rem;">
                <strong style="color:#a5b4fc;">${ev.domain}.${ev.field}</strong>
                <span style="font-size:0.65rem; background:#334155; padding:0.15rem 0.4rem; border-radius:4px; text-transform:uppercase;">${ev.classification}</span>
              </div>
              <div style="color:#94a3b8; font-size:0.75rem;">Source: ${ev.source}</div>
            `;
            evList.appendChild(div);
          });
        }
      }
    } catch (err) {
      console.error('Error fetching 360 data:', err.message);
      document.getElementById('evidenceList').innerHTML = `<div style="color:#f87171; font-size:0.8rem;">Could not query Zoho People API: ${err.message}.</div>`;
    }
  }

  // 2. Executive Summary
  async function fetchSummary() {
    const box = document.getElementById('summaryTextBox');
    const badge = document.getElementById('summaryModelBadge');
    box.innerHTML = '<p style="color:#94a3b8; font-style:italic;">Querying executive summary synthesized from real-time Zoho People data...</p>';

    try {
      const json = await requestApi('summary', activeEmployeeId);
      if (json.success && json.data) {
        badge.textContent = json.data.isAiGenerated ? `AI Generated (${json.data.model || 'Gemini'})` : 'Zoho Record Summary';
        badge.className = json.data.isAiGenerated ? 'badge-tag badge-cloud' : 'badge-tag badge-portal';

        const paras = (json.data.summary || '').split('\n').filter(p => p.trim());
        box.innerHTML = paras.map(p => `<p style="margin-bottom:0.85rem; line-height:1.6;">${p}</p>`).join('');
      }
    } catch (err) {
      box.innerHTML = `<p style="color:#f87171;">Failed to retrieve summary: ${err.message}</p>`;
    }
  }

  // 3. Strategic Insights
  async function fetchInsights() {
    const container = document.getElementById('insightsGrid');
    container.innerHTML = '<div style="color:#94a3b8;">Loading verified insights...</div>';

    try {
      const json = await requestApi('insights', activeEmployeeId);
      if (json.success && json.data?.insights) {
        container.innerHTML = '';
        if (json.data.insights.length === 0) {
          container.innerHTML = '<div style="color:#64748b;">No strategic insights available for current verified record.</div>';
          return;
        }
        json.data.insights.forEach(item => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(30,41,59,0.5); border:1px solid #334155; border-radius:10px; padding:1.2rem;';
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem;">
              <span style="font-size:0.75rem; text-transform:uppercase; color:#818cf8; font-weight:600;">${item.domain}</span>
              <span style="font-size:0.65rem; background:#334155; color:#f8fafc; padding:0.15rem 0.45rem; border-radius:4px; text-transform:uppercase;">${item.type}</span>
            </div>
            <h4 style="font-size:0.95rem; font-weight:600; color:#fff; margin-bottom:0.4rem;">${item.headline || 'Insight'}</h4>
            <p style="font-size:0.85rem; color:#cbd5e1; line-height:1.5;">${item.description}</p>
          `;
          container.appendChild(card);
        });
      }
    } catch (err) {
      container.innerHTML = `<div style="color:#f87171;">Failed to load insights: ${err.message}</div>`;
    }
  }

  // 4. Timeline
  async function fetchTimeline() {
    const container = document.getElementById('timelineList');
    container.innerHTML = '<div style="color:#94a3b8;">Loading chronological milestones from Zoho People...</div>';

    try {
      const json = await requestApi('timeline', activeEmployeeId);
      if (json.success && json.data?.events) {
        container.innerHTML = '';
        if (json.data.events.length === 0) {
          container.innerHTML = '<div style="color:#64748b;">No chronological events recorded in Zoho People for this employee.</div>';
          return;
        }
        json.data.events.forEach(evt => {
          const div = document.createElement('div');
          div.className = 'timeline-item';
          div.innerHTML = `
            <div class="timeline-dot"></div>
            <div style="font-size:0.75rem; color:#818cf8; font-family:monospace; margin-bottom:0.2rem;">${evt.date || 'Active Cycle'}</div>
            <h4 style="font-size:0.9rem; font-weight:600; color:#fff;">${evt.title}</h4>
            <p style="font-size:0.8rem; color:#94a3b8; margin-top:0.25rem;">${evt.description}</p>
          `;
          container.appendChild(div);
        });
      }
    } catch (err) {
      container.innerHTML = `<div style="color:#f87171;">Failed to load timeline: ${err.message}</div>`;
    }
  }

  // 5. Ask HR AI Form
  const askForm = document.getElementById('askHrForm');
  if (askForm) {
    askForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const qInput = document.getElementById('hrQuestionInput');
      const question = (qInput.value || '').trim();
      if (!question) return;

      const submitBtn = document.getElementById('submitAskBtn');
      const resultBox = document.getElementById('askResultBox');
      const answerText = document.getElementById('askAnswerText');
      const typeBadge = document.getElementById('askTypeBadge');
      const confBadge = document.getElementById('askConfBadge');
      const evList = document.getElementById('askEvList');
      const evSection = document.getElementById('askEvSection');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Analyzing...';

      try {
        const json = await postApi('ask', { question }, activeEmployeeId);
        if (json.success && json.data) {
          resultBox.style.display = 'block';
          answerText.textContent = json.data.answer;
          typeBadge.textContent = json.data.type || 'Insight';
          confBadge.textContent = `Confidence: ${json.data.confidence}`;

          evList.innerHTML = '';
          if (Array.isArray(json.data.evidence) && json.data.evidence.length > 0) {
            json.data.evidence.forEach(ev => {
              const li = document.createElement('li');
              li.textContent = ev;
              evList.appendChild(li);
            });
            evSection.style.display = 'block';
          } else {
            evSection.style.display = 'none';
          }
        }
      } catch (err) {
        alert(`Failed to obtain AI answer: ${err.message}`);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Ask AI';
      }
    });
  }

  // Preset Questions
  document.querySelectorAll('.preset-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const qInput = document.getElementById('hrQuestionInput');
      qInput.value = btn.textContent;
      document.getElementById('submitAskBtn').click();
    });
  });

  // Raw JSON Inspector
  document.getElementById('openRawBtn').addEventListener('click', () => {
    rawModal.style.display = 'flex';
    rawEndpoint.textContent = `GET /v1/employees/${activeEmployeeId}/360`;
    rawContent.textContent = JSON.stringify(cachedCanonical || { notice: 'Fetch 360 profile first' }, null, 2);
  });

  document.getElementById('closeRawBtn').addEventListener('click', () => {
    rawModal.style.display = 'none';
  });

  // Zoho People Connection Modal Management
  function openConnectModal() {
    zohoConnectModal.style.display = 'flex';
    zohoTokenInput.value = getZohoToken();
    zohoDcSelect.value = getZohoDataCenter();
    zohoConnectStatusBox.style.display = 'none';
  }

  openZohoConnectBtn.addEventListener('click', openConnectModal);
  noticeActionBtn.addEventListener('click', openConnectModal);
  closeZohoConnectBtn.addEventListener('click', () => {
    zohoConnectModal.style.display = 'none';
  });

  saveZohoTokenBtn.addEventListener('click', async () => {
    const token = zohoTokenInput.value.trim();
    const dc = zohoDcSelect.value;
    if (!token) {
      alert('Please enter a valid Zoho People OAuth token.');
      return;
    }

    saveZohoTokenBtn.disabled = true;
    saveZohoTokenBtn.textContent = 'Testing Live Connection...';
    zohoConnectStatusBox.style.display = 'block';
    zohoConnectStatusBox.style.background = 'rgba(59,130,246,0.1)';
    zohoConnectStatusBox.style.border = '1px solid #3b82f6';
    zohoConnectStatusBox.style.color = '#93c5fd';
    zohoConnectStatusBox.textContent = 'Connecting to Zoho People API (https://people.zoho.' + dc + ')...';

    try {
      const testRes = await postApi('zohoConfigure', { token, dataCenter: dc });
      if (testRes.success && testRes.data?.connected) {
        setZohoToken(token);
        setZohoDataCenter(dc);
        zohoConnectStatusBox.style.background = 'rgba(52,211,153,0.1)';
        zohoConnectStatusBox.style.border = '1px solid #10b981';
        zohoConnectStatusBox.style.color = '#6ee7b7';
        zohoConnectStatusBox.textContent = `Success! Connected to Zoho People (${testRes.data.organizationName || 'VSK HR Solution'}). Found ${testRes.data.activeRecordsCount || 0} active records.`;
        checkZohoStatus();
        setTimeout(() => {
          zohoConnectModal.style.display = 'none';
          loadAllData();
        }, 1500);
      } else {
        zohoConnectStatusBox.style.background = 'rgba(239,68,68,0.1)';
        zohoConnectStatusBox.style.border = '1px solid #ef4444';
        zohoConnectStatusBox.style.color = '#fca5a5';
        zohoConnectStatusBox.textContent = `Connection Test Failed: ${testRes.data?.message || 'Invalid token or insufficient scopes.'}`;
      }
    } catch (err) {
      zohoConnectStatusBox.style.background = 'rgba(239,68,68,0.1)';
      zohoConnectStatusBox.style.border = '1px solid #ef4444';
      zohoConnectStatusBox.style.color = '#fca5a5';
      zohoConnectStatusBox.textContent = `Connection Error: ${err.message}`;
    } finally {
      saveZohoTokenBtn.disabled = false;
      saveZohoTokenBtn.textContent = 'Test & Save Live Token';
    }
  });

  clearZohoTokenBtn.addEventListener('click', () => {
    setZohoToken('');
    zohoTokenInput.value = '';
    zohoConnectStatusBox.style.display = 'block';
    zohoConnectStatusBox.style.background = 'rgba(100,116,139,0.2)';
    zohoConnectStatusBox.style.border = '1px solid #475569';
    zohoConnectStatusBox.style.color = '#cbd5e1';
    zohoConnectStatusBox.textContent = 'Live token cleared. No mock data will be used.';
    checkZohoStatus();
  });

  // Live Directory Modal Management
  browseDirectoryBtn.addEventListener('click', async () => {
    directoryModal.style.display = 'flex';
    directoryListContainer.innerHTML = '<div style="color:#94a3b8; padding:1.5rem; text-align:center;">Querying live Zoho People employee directory...</div>';

    try {
      const res = await requestApi('zohoEmployees');
      if (res.success && res.data?.employees && res.data.employees.length > 0) {
        directoryListContainer.innerHTML = '';
        res.data.employees.forEach(emp => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:0.75rem 1rem; border-radius:8px; border:1px solid #334155; cursor:pointer; transition:border-color 0.2s;';
          row.innerHTML = `
            <div>
              <div style="font-weight:600; color:#fff;">${emp.fullName} <span style="font-size:0.75rem; color:#818cf8; font-family:monospace; margin-left:0.4rem;">${emp.employeeId || emp.recordId}</span></div>
              <div style="font-size:0.75rem; color:#94a3b8; margin-top:0.2rem;">
                ${emp.jobTitle || 'Unassigned Role'} &bull; ${emp.department || 'Unassigned Dept'} &bull; ${emp.workLocation || 'Unassigned Location'}
              </div>
            </div>
            <button class="btn-primary" style="font-size:0.75rem; padding:0.3rem 0.65rem;">Select & View 360</button>
          `;
          row.addEventListener('click', () => {
            empInput.value = emp.employeeId || emp.recordId;
            directoryModal.style.display = 'none';
            loadAllData();
          });
          directoryListContainer.appendChild(row);
        });
      } else {
        directoryListContainer.innerHTML = `
          <div style="text-align:center; padding:1.5rem; color:#fca5a5;">
            <p style="margin:0 0 0.75rem 0;">No active employees returned from Zoho People.</p>
            <p style="font-size:0.8rem; color:#94a3b8;">${res.data?.message || 'Ensure your Zoho People OAuth token is connected and has permission to read employee records.'}</p>
            <button id="modalConnectBtn" class="btn-primary" style="margin-top:0.5rem; font-size:0.75rem;">Open Zoho Connection Modal</button>
          </div>
        `;
        document.getElementById('modalConnectBtn')?.addEventListener('click', () => {
          directoryModal.style.display = 'none';
          openConnectModal();
        });
      }
    } catch (err) {
      directoryListContainer.innerHTML = `
        <div style="text-align:center; padding:1.5rem; color:#fca5a5;">
          <p>Failed to query Zoho People directory: ${err.message}</p>
          <button id="modalRetryConnectBtn" class="btn-primary" style="font-size:0.75rem;">Connect Live Token</button>
        </div>
      `;
      document.getElementById('modalRetryConnectBtn')?.addEventListener('click', () => {
        directoryModal.style.display = 'none';
        openConnectModal();
      });
    }
  });

  closeDirectoryBtn.addEventListener('click', () => {
    directoryModal.style.display = 'none';
  });

  fetchBtn.addEventListener('click', loadAllData);

  // Initialize Zoho People Bridge and live status
  window.ZohoPeopleBridge.init((context) => {
    if (context.isEmbedded && context.entityId) {
      console.log('[App] Extracted Zoho People entity ID:', context.entityId);
      empInput.value = context.entityId;
    }
    updateBackendBadge();
    checkZohoStatus();
    loadAllData();
  });
});
