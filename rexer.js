const COLORS = [
  '#e53935', '#8e24aa', '#1e88e5', '#43a047',
  '#f4511e', '#00897b', '#d81b60', '#6d4c41',
  '#3949ab', '#c0ca33', '#00acc1', '#ff8f00',
  '#5c6bc0', '#7cb342', '#ec407a',
];

const regexList = document.getElementById('regex-list');
const addRegexBtn = document.getElementById('add-regex');
const testStringsEl = document.getElementById('test-strings');
const resultsEl = document.getElementById('results');
const backdropEl = document.getElementById('test-strings-backdrop');
const highlightsEl = document.getElementById('test-strings-highlights');
const lineNumbersEl = document.getElementById('line-numbers');

let regexRows = [];

// --- Utilities ---

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function createCopyBtn(getText) {
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.title = 'Copy to clipboard';
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11V3a1 1 0 011-1h8"/></svg>';
  btn.addEventListener('click', () => {
    navigator.clipboard.writeText(getText()).then(() => {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1000);
    });
  });
  return btn;
}

// --- Regex rows ---

function createRegexRow() {
  const index = regexRows.length;
  const color = COLORS[index % COLORS.length];

  const row = document.createElement('div');
  row.className = 'regex-row';

  const numberEl = document.createElement('span');
  numberEl.className = 'regex-number';
  numberEl.textContent = '#' + (index + 1);
  numberEl.style.color = color;

  const indicator = document.createElement('span');
  indicator.className = 'color-indicator';
  indicator.style.background = color;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'name';
  nameInput.placeholder = 'name';
  nameInput.spellcheck = false;
  nameInput.addEventListener('input', () => {
    nameInput.classList.toggle('has-value', nameInput.value.length > 0);
    runAll();
  });

  const pattern = document.createElement('textarea');
  pattern.className = 'pattern';
  pattern.placeholder = 'pattern';
  pattern.rows = 1;
  pattern.spellcheck = false;
  pattern.addEventListener('input', () => {
    autoResizeTextarea(pattern);
    runAll();
  });

  const flags = document.createElement('input');
  flags.type = 'text';
  flags.className = 'flags';
  flags.placeholder = 'gi';
  flags.spellcheck = false;
  flags.addEventListener('input', runAll);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '\u00d7';
  removeBtn.title = 'Remove';

  const copyBtn = createCopyBtn(() => pattern.value);

  const entry = { row, numberEl, nameInput, pattern, flags, removeBtn, errorEl: null, color };
  removeBtn.addEventListener('click', () => removeRegexRow(entry));

  row.append(numberEl, indicator, nameInput, pattern, flags, copyBtn, removeBtn);
  regexList.appendChild(row);
  regexRows.push(entry);

  return entry;
}

function removeRegexRow(entry) {
  if (regexRows.length <= 1) return;
  entry.row.remove();
  if (entry.errorEl) entry.errorEl.remove();
  regexRows = regexRows.filter(e => e !== entry);
  reassignColors();
  runAll();
}

function reassignColors() {
  regexRows.forEach((entry, i) => {
    entry.color = COLORS[i % COLORS.length];
    entry.row.querySelector('.color-indicator').style.background = entry.color;
    entry.numberEl.textContent = '#' + (i + 1);
    entry.numberEl.style.color = entry.color;
  });
}

// --- Compilation and matching ---

function compileRegex(entry) {
  if (entry.errorEl) {
    entry.errorEl.remove();
    entry.errorEl = null;
  }
  entry.pattern.classList.remove('error');
  entry.flags.classList.remove('error');

  const pat = entry.pattern.value;
  if (!pat) return null;

  try {
    let f = entry.flags.value;
    if (!f.includes('d')) f += 'd';
    return new RegExp(pat, f);
  } catch (e) {
    // If the 'd' flag caused the error, try without it
    try {
      return new RegExp(pat, entry.flags.value);
    } catch (e2) {
      entry.pattern.classList.add('error');
      const errDiv = document.createElement('div');
      errDiv.className = 'regex-error';
      errDiv.textContent = e2.message;
      entry.errorEl = errDiv;
      entry.row.insertAdjacentElement('afterend', errDiv);
      return null;
    }
  }
}

function getMatches(regex, str) {
  if (!regex) return [];
  const results = [];

  if (regex.flags.includes('g')) {
    for (const m of str.matchAll(new RegExp(regex.source, regex.flags))) {
      results.push(matchInfo(m));
    }
  } else {
    const m = str.match(regex);
    if (m) results.push(matchInfo(m));
  }

  return results;
}

function matchInfo(m) {
  const groups = [];
  const indices = [];

  // full match position
  const fullEnd = m.index + m[0].length;

  // Determine which numbered groups correspond to named groups
  const namedNums = new Set();
  if (m.groups && m.indices && m.indices.groups) {
    for (const name of Object.keys(m.groups)) {
      const namedIdx = m.indices.groups[name];
      if (!namedIdx) continue;
      for (let i = 1; i < m.length; i++) {
        if (m.indices[i] && m.indices[i][0] === namedIdx[0] && m.indices[i][1] === namedIdx[1]) {
          namedNums.add(i);
          break;
        }
      }
    }
  }

  // numbered groups (always collect indices for highlighting, skip display if named)
  for (let i = 1; i < m.length; i++) {
    if (m[i] !== undefined) {
      if (m.indices && m.indices[i]) {
        indices.push({ start: m.indices[i][0], end: m.indices[i][1] });
      }
      if (!namedNums.has(i)) {
        groups.push({ name: String(i), value: m[i] });
      }
    }
  }
  // named groups
  if (m.groups) {
    for (const [name, value] of Object.entries(m.groups)) {
      if (value !== undefined) {
        groups.push({ name, value });
      }
    }
  }
  return { full: m[0], index: m.index, end: fullEnd, groups, indices };
}

// --- Highlight logic ---

function buildHighlightMap(line, compiled) {
  // For each character position: { color, opacity } or null
  const map = new Array(line.length).fill(null);

  for (const { regex, entry } of compiled) {
    if (!regex) continue;
    const matches = getMatches(regex, line);

    for (const m of matches) {
      // Full match: opacity 0.2 — only if char not yet claimed
      for (let pos = m.index; pos < m.end; pos++) {
        if (pos < line.length && !map[pos]) {
          map[pos] = { color: entry.color, opacity: 0.2, owner: entry };
        }
      }

      // Capture groups: opacity 0.45 — upgrade only if same regex owns the char
      for (const idx of m.indices) {
        for (let pos = idx.start; pos < idx.end; pos++) {
          if (pos < line.length && map[pos] && map[pos].owner === entry) {
            map[pos] = { color: entry.color, opacity: 0.45, owner: entry };
          }
        }
      }
    }
  }

  return map;
}

function buildHighlightHTML(line, map) {
  if (line.length === 0) return '\n';

  let html = '';
  let i = 0;

  while (i < line.length) {
    const cell = map[i];

    if (!cell) {
      // Unhighlighted run
      let j = i;
      while (j < line.length && !map[j]) j++;
      html += escapeHTML(line.slice(i, j));
      i = j;
    } else {
      // Highlighted run — same color+opacity
      let j = i;
      while (j < line.length && map[j] && map[j].color === cell.color && map[j].opacity === cell.opacity) j++;
      const bg = hexToRGBA(cell.color, cell.opacity);
      html += '<span style="background:' + bg + '">' + escapeHTML(line.slice(i, j)) + '</span>';
      i = j;
    }
  }

  return html + '\n';
}

function updateHighlights(compiled) {
  const text = testStringsEl.value;
  const lines = text.split('\n');
  let html = '';

  for (const line of lines) {
    const map = buildHighlightMap(line, compiled);
    html += buildHighlightHTML(line, map);
  }

  // Trailing space prevents browser from collapsing final newline
  highlightsEl.innerHTML = html + ' ';
}

// --- Line numbers ---

function updateLineNumbers() {
  const count = testStringsEl.value.split('\n').length;
  let html = '';
  for (let i = 1; i <= count; i++) {
    html += '<div>' + i + '</div>';
  }
  lineNumbersEl.innerHTML = html;
}

// --- Scroll sync ---

function syncScroll() {
  backdropEl.scrollTop = testStringsEl.scrollTop;
  backdropEl.scrollLeft = testStringsEl.scrollLeft;
  lineNumbersEl.scrollTop = testStringsEl.scrollTop;
}

testStringsEl.addEventListener('scroll', syncScroll);

// --- Results rendering ---

function runAll() {
  const compiled = regexRows.map((entry, i) => ({
    regex: compileRegex(entry),
    entry,
    number: i + 1,
  }));

  updateHighlights(compiled);
  updateLineNumbers();

  const lines = testStringsEl.value.split('\n');
  if (lines.length === 1 && lines[0] === '') {
    resultsEl.innerHTML = '<p class="empty-results">Enter regexes and test strings above.</p>';
    return;
  }

  resultsEl.innerHTML = '';

  for (const str of lines) {
    const card = document.createElement('div');
    card.className = 'result-card';

    const strEl = document.createElement('div');
    strEl.className = 'result-string';
    strEl.textContent = str || '(empty line)';
    card.appendChild(strEl);

    let hasMatch = false;

    for (const { regex, entry, number } of compiled) {
      if (!regex) continue;
      const matches = getMatches(regex, str);
      if (matches.length === 0) continue;
      hasMatch = true;

      for (const m of matches) {
        const block = document.createElement('div');
        block.className = 'match-block';
        block.style.borderColor = entry.color;

        const header = document.createElement('div');
        header.className = 'match-header';
        const label = document.createElement('span');
        label.className = 'regex-label';
        label.style.color = entry.color;
        label.textContent = entry.nameInput.value
          ? '#' + number + ' ' + entry.nameInput.value
          : '#' + number + ' /' + entry.pattern.value + '/' + entry.flags.value;
        header.appendChild(label);
        block.appendChild(header);

        const fullEl = document.createElement('span');
        fullEl.className = 'match-full';
        fullEl.textContent = m.full === '' ? '(empty match)' : m.full;
        block.appendChild(fullEl);

        if (m.groups.length > 0) {
          const dl = document.createElement('dl');
          dl.className = 'groups-table';
          for (const g of m.groups) {
            const wrap = document.createElement('div');
            wrap.className = 'group-entry';
            const dt = document.createElement('dt');
            dt.textContent = g.name;
            const dd = document.createElement('dd');
            dd.textContent = g.value;
            wrap.append(dt, dd);
            dl.appendChild(wrap);
          }
          block.appendChild(dl);
        }

        card.appendChild(block);
      }
    }

    if (!hasMatch) {
      const noMatch = document.createElement('div');
      noMatch.className = 'no-match';
      noMatch.textContent = 'No matches';
      card.appendChild(noMatch);
    }

    resultsEl.appendChild(card);
  }
}

testStringsEl.addEventListener('input', runAll);
addRegexBtn.addEventListener('click', () => { createRegexRow(); runAll(); });

document.getElementById('copy-test-strings').addEventListener('click', () => {
  const btn = document.getElementById('copy-test-strings');
  navigator.clipboard.writeText(testStringsEl.value).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1000);
  });
});

// --- Export ---
const exportBtn = document.getElementById('export-btn');
const exportPanel = document.getElementById('export-panel');
const exportTextarea = document.getElementById('export-textarea');

exportBtn.addEventListener('click', () => {
  const isOpen = !exportPanel.hidden;
  if (isOpen) {
    exportPanel.hidden = true;
    exportBtn.classList.remove('active');
    return;
  }

  const data = {
    regexes: regexRows.map((entry, i) => {
      const obj = { number: i + 1, pattern: entry.pattern.value, flags: entry.flags.value };
      if (entry.nameInput.value) obj.name = entry.nameInput.value;
      return obj;
    }),
    testStrings: testStringsEl.value.split('\n'),
  };

  exportTextarea.value = JSON.stringify(data, null, 2);
  exportPanel.hidden = false;
  exportBtn.classList.add('active');
});

document.getElementById('copy-export').addEventListener('click', () => {
  const btn = document.getElementById('copy-export');
  navigator.clipboard.writeText(exportTextarea.value).then(() => {
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 1000);
  });
});

// --- Names toggle ---
const toggleNamesBtn = document.getElementById('toggle-names');
regexList.classList.add('names-hidden');

toggleNamesBtn.addEventListener('click', () => {
  const showing = regexList.classList.toggle('names-hidden');
  toggleNamesBtn.classList.toggle('active', !showing);
});

// start with one empty row
createRegexRow();
