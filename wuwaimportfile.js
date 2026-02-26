const https = require('https');
const http = require('http');
const { URL } = require('url');
const Character = require('../../models/Character');

module.exports = {
  name: 'wuwaimportfile',
  description: 'Import character JSON from a file URL or raw JSON (admin only).',
  options: [
    { name: 'url', description: 'Public file URL (attachment URL)', type: 3, required: false },
    { name: 'data', description: 'Raw JSON string (single object or array)', type: 3, required: false }
  ],
  callback: async (client, interaction) => {
    if (!interaction.member.permissions.has('ManageGuild')) return interaction.reply({ content: 'No permission', ephemeral: true });
    const url = interaction.options.getString('url');
    const raw = interaction.options.getString('data');
    if (!url && !raw) return interaction.reply({ content: 'Provide a `url` or `data`.', ephemeral: true });

    // use flags instead of deprecated `ephemeral` option
    try {
      await interaction.deferReply({ flags: 64 }); // 64 = EPHEMERAL
    } catch (e) {
      console.warn('deferReply failed in wuwaimportfile:', e?.code || e);
    }

    let docs = [];
    if (url) {
      try {
        const json = await fetchUrlJson(url);
        docs = Array.isArray(json) ? json : [json];
      } catch (err) {
        return interaction.editReply('Failed to fetch/parse URL: ' + err.message);
      }
    } else {
      try {
        const json = JSON.parse(raw);
        docs = Array.isArray(json) ? json : [json];
      } catch (err) {
        return interaction.editReply('Invalid JSON: ' + err.message);
      }
    }

    let saved = 0;
    let failed = 0;
    const errors = [];

    for (const d of docs) {
      try {
        const nameKey = d.name ? d.name.toLowerCase().replace(/[^a-z0-9]/g, '') : null;
        if (!nameKey) {
          failed++;
          errors.push('Missing name in one item');
          continue;
        }
        d.nameKey = nameKey;
        await Character.updateOne({ nameKey }, { $set: d }, { upsert: true });
        saved++;
      } catch (e) {
        failed++;
        errors.push(e.message);
      }
    }

    return interaction.editReply(`Imported: ${saved}, failed: ${failed}` + (errors.length ? '\nErrors: ' + errors.slice(0, 5).join(' ; ') : ''));
  }
};

function fetchUrlJson(urlStr) {
  return new Promise((resolve, reject) => {
    let urlObj;
    try { urlObj = new URL(urlStr); } catch (e) { return reject(e); }
    const lib = urlObj.protocol === 'https:' ? https : http;
    const req = lib.get(urlStr, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
  });
}
