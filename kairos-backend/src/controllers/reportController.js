const reportService = require('../services/reportService');

/**
 * GET /api/staff/reports/summary?language=all|en|fr&startDate=...&endDate=...
 * Protected: requires 'report_staff' role
 */
async function getSummary(req, res, next) {
  try {
    const { language = 'all', startDate, endDate } = req.query;

    if (language && !['all', 'en', 'fr'].includes(language.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: "Invalid language parameter. Permitted values: 'all', 'en', 'fr'."
      });
    }

    const report = await reportService.getSummaryReport({
      language,
      startDate,
      endDate
    });

    return res.status(200).json({
      success: true,
      filters: { language, startDate: startDate || null, endDate: endDate || null },
      report
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/staff/reports/records?language=all|en|fr&startDate=...&endDate=...
 * Protected: requires 'report_staff' role
 */
async function getRecords(req, res, next) {
  try {
    const { language = 'all', startDate, endDate } = req.query;

    if (language && !['all', 'en', 'fr'].includes(language.toLowerCase())) {
      return res.status(400).json({
        success: false,
        error: "Invalid language parameter. Permitted values: 'all', 'en', 'fr'."
      });
    }

    const records = await reportService.getExportRecords({
      language,
      startDate,
      endDate
    });

    return res.status(200).json({
      success: true,
      count: records.length,
      filters: { language, startDate: startDate || null, endDate: endDate || null },
      records
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getRecords
};
