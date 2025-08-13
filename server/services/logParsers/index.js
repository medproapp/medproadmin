'use strict';

const mainServerLogParser = require('./mainServerLogParser');
const mainServerInsights = require('./mainServerInsights');
const communicationWorkerParser = require('./communicationWorkerLogParser');
const communicationWorkerInsights = require('./communicationWorkerInsights');

function getParserFor(processName) {
    const name = String(processName || '').toLowerCase();
    if (name === 'medpro-backend') return mainServerLogParser;
    if (name === 'medpro-communication-worker') return communicationWorkerParser;
    // Fallback generic parser
    return {
        parse(lines = []) {
            const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
            return lines.filter(Boolean).map((raw) => {
                const clean = stripAnsi(String(raw));
                return { type: 'log', level: 'info', message: clean };
            });
        }
    };
}

module.exports = { getParserFor };

function getInsightsBuilderFor(processName) {
    const name = String(processName || '').toLowerCase();
    if (name === 'medpro-backend') return mainServerInsights;
    if (name === 'medpro-communication-worker') return communicationWorkerInsights;
    return {
        build(lines = []) {
            const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '');
            const entries = (lines || []).filter(Boolean).map(l => ({ type: 'log', message: stripAnsi(String(l)) }));
            return { entries };
        }
    };
}

module.exports.getInsightsBuilderFor = getInsightsBuilderFor;


