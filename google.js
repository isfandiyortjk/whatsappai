import { GoogleSpreadsheet } from 'google-spreadsheet';

// Функция для записи данных в таблицу Google Sheets
export async function writeToSheet(sheetName, rowData) {
  try {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
    await doc.useServiceAccountAuth(JSON.parse(process.env.GOOGLE_SERVICE_KEY));
    await doc.loadInfo();

    // Найти или создать лист
    let sheet = doc.sheetsByTitle[sheetName];
    if (!sheet) {
      sheet = await doc.addSheet({ title: sheetName, headerValues: Object.keys(rowData) });
    }

    // Добавить строку
    await sheet.addRow(rowData);
    console.log(`✅ Добавлено в лист "${sheetName}":`, rowData);
  } catch (e) {
    console.error("❌ Ошибка записи в Google Sheets:", e);
  }
}
