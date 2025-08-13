/*
  End-to-end test of the MedPro Admin Workers API without shell quoting issues.
  Usage: node medproadmin/server/scripts/test-workers-api.js [envId]
*/

const axios = require('axios');

async function main() {
  const baseUrl = process.env.MEDPRO_ADMIN_BASE_URL || 'http://localhost:4040';
  const environmentId = Number(process.argv[2] || process.env.ENV_ID || 8);

  const credentials = {
    email: process.env.MEDPRO_ADMIN_EMAIL || 'demo@medpro.com',
    password: process.env.MEDPRO_ADMIN_PASSWORD || 'password',
  };

  try {
    const { data: login } = await axios.post(
      `${baseUrl}/api/v1/auth/login`,
      credentials,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const token = login?.data?.token;
    if (!token) throw new Error('No token from login');
    const headers = { Authorization: `Bearer ${token}` };

    const list1 = await axios.get(
      `${baseUrl}/api/v1/environments/${environmentId}/workers`,
      { headers }
    );
    console.log('LIST1', JSON.stringify(list1.data));

    const start = await axios.post(
      `${baseUrl}/api/v1/environments/${environmentId}/workers/medpro-prescription-agenda/start`,
      null,
      { headers }
    );
    console.log('START', JSON.stringify(start.data));

    await new Promise((r) => setTimeout(r, 1500));

    const list2 = await axios.get(
      `${baseUrl}/api/v1/environments/${environmentId}/workers`,
      { headers }
    );
    console.log('LIST2', JSON.stringify(list2.data));

    const logs = await axios.get(
      `${baseUrl}/api/v1/environments/${environmentId}/workers/medpro-prescription-agenda/logs`,
      { headers, params: { lines: 20, type: 'out' } }
    );
    console.log('LOGS', JSON.stringify(logs.data).slice(0, 200) + '...');

    const stop = await axios.post(
      `${baseUrl}/api/v1/environments/${environmentId}/workers/medpro-prescription-agenda/stop`,
      null,
      { headers }
    );
    console.log('STOP', JSON.stringify(stop.data));

    await new Promise((r) => setTimeout(r, 800));

    const list3 = await axios.get(
      `${baseUrl}/api/v1/environments/${environmentId}/workers`,
      { headers }
    );
    console.log('LIST3', JSON.stringify(list3.data));
  } catch (e) {
    const status = e?.response?.status;
    const data = e?.response?.data || e?.message;
    console.error('HTTP', status, typeof data === 'object' ? JSON.stringify(data) : data);
    process.exit(1);
  }
}

main();


