const stringify = require("csv-stringify");

const json_response = (table, str) => ({
  json: {
    download: {
      blob: Buffer.from(str).toString("base64"),
      filename: `${table.name}.csv`,
      mimetype: "text/csv",
    },
  },
});

const auto_expand_json_cols = (columns, table, rows) => {
  for (const field of table.fields) {
    if (field.type?.name === "JSON" && field.attributes?.hasSchema) {
      (field.attributes?.schema || []).forEach((s) => {
        columns.push(`${field.name}.${s.key}`);
      });
      columns.splice(columns.indexOf(field.name), 1);
      for (const row of rows) {
        Object.keys(row[field.name] || {}).forEach((k) => {
          row[`${field.name}.${k}`] = row[field.name][k];
        });
        delete row[field.name];
      }
    }
  }
};
const async_stringify = (...args) => {
  return new Promise((resolve) => {
    stringify(...args, function (err, output) {
      resolve(output);
    });
  });
};
module.exports = { json_response, auto_expand_json_cols, async_stringify };
