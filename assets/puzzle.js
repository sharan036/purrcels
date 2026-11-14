'use strict';
const PUZZLES = [
  { rows: ['00011','01111','00022','33442','33442'], solution: [0,2,4,1,3] },
  { rows: ['00011','22001','42333','44433','44433'], solution: [2,4,1,3,0] },
  { rows: ['00002','31102','31222','34422','44444'], solution: [3,1,4,0,2] },
  { rows: ['00012','01112','33322','33344','44444'], solution: [0,2,4,1,3] },
];
const regionName = 'ABCDE';
const N = 5;
const getRow = i => Math.floor(i / N);
const getCol = i => i % N;
function conflicts(a, b, regions) {
  return a !== b && (getRow(a) === getRow(b) || getCol(a) === getCol(b) ||
    regions[a] === regions[b] || (Math.abs(getRow(a) - getRow(b)) === 1 && Math.abs(getCol(a) - getCol(b)) === 1));
}
if (typeof module !== 'undefined') module.exports = { PUZZLES, conflicts };

if (typeof document !== 'undefined') {
  const byId = id => document.getElementById(id);
  const board = byId('board');
  const status = byId('game-status');
  const catTool = byId('cat-tool');
  const markTool = byId('mark-tool');
  let puzzle = 0;
  let tool = 'cat';
  let states = [];
  let cells = [];
  let regions = '';
  let active = 0;
  let highlighted = -1;

  function setTool(next) {
    tool = next;
    catTool.setAttribute('aria-pressed', String(tool === 'cat'));
    markTool.setAttribute('aria-pressed', String(tool === 'mark'));
  }

  function show(message) {
    const cats = states.flatMap((s, i) => s === 'cat' ? [i] : []);
    const bad = new Set(cats.filter(i => cats.some(j => conflicts(i, j, regions))));
    byId('progress').textContent = cats.length + ' / 5 cats';
    const solved = cats.length === N && !bad.size;
    for (const [i, cell] of cells.entries()) {
      const item = states[i];
      const marker = cell.firstElementChild;
      cell.replaceChildren(marker);
      if (item === 'cat') {
        const img = document.createElement('img');
        img.src = 'assets/cat.webp';
        img.alt = '';
        img.draggable = false;
        cell.append(img);
      } else if (item === 'mark') {
        const mark = document.createElement('span');
        mark.className = 'mark';
        mark.textContent = '×';
        mark.setAttribute('aria-hidden', 'true');
        cell.append(mark);
      }
      cell.dataset.conflict = String(bad.has(i));
      cell.dataset.hint = String(i === highlighted);
      cell.setAttribute('aria-label', 'Row ' + (getRow(i) + 1) + ', column ' + (getCol(i) + 1) +
        ', patch ' + regionName[regions[i]] + ', ' + (item || 'empty') +
        (bad.has(i) ? ', conflicts with another cat' : ''));
    }
    status.textContent = solved ? 'Puzzle solved! Every cat has its own space.' :
      message || (bad.size ? 'Some cats share a row, column, patch, or corner. Try moving one.' : 'Select a tile to use the current tool.');
  }

  function setActive(i, focus = false) {
    cells[active].tabIndex = -1;
    active = i;
    cells[i].tabIndex = 0;
    if (focus) cells[i].focus();
  }
  function load(message) {
    active = 0;
    highlighted = -1;
    regions = PUZZLES[puzzle].rows.join('');
    states = Array(N * N).fill('');
    cells = states.map((_, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell';
      b.dataset.region = regions[i];
      b.tabIndex = i === 0 ? 0 : -1;
      const label = document.createElement('span');
      label.className = 'region';
      label.textContent = regionName[regions[i]];
      label.setAttribute('aria-hidden', 'true');
      b.append(label);
      b.addEventListener('focus', () => setActive(i));
      b.addEventListener('click', () => {
        setActive(i);
        highlighted = -1;
        states[i] = states[i] === tool ? '' : tool;
        show();
      });
      b.addEventListener('keydown', e => {
        const delta = {ArrowUp:-N, ArrowDown:N, ArrowLeft:-1, ArrowRight:1}[e.key];
        if (delta === undefined) return;
        e.preventDefault();
        const j = i + delta;
        if (j >= 0 && j < N * N && (Math.abs(delta) === N || getRow(j) === getRow(i))) setActive(j, true);
      });
      return b;
    });
    board.replaceChildren(...cells);
    byId('board-number').textContent = 'Puzzle ' + (puzzle + 1) + ' of ' + PUZZLES.length;
    show(message);
  }
  catTool.addEventListener('click', () => { setTool('cat'); status.textContent = 'Cat tool selected. Choose a tile.'; });
  markTool.addEventListener('click', () => { setTool('mark'); status.textContent = 'Mark tool selected. Choose a tile to mark or unmark it.'; });
  byId('reset').addEventListener('click', () => { setTool('cat'); load('Board reset. Select a tile to place a cat.'); });
  byId('next').addEventListener('click', () => {
    puzzle = (puzzle + 1) % PUZZLES.length;
    setTool('cat');
    load('Puzzle ' + (puzzle + 1) + ' ready. Select a tile to place a cat.');
  });
  byId('hint').addEventListener('click', () => {
    const solution = PUZZLES[puzzle].solution.map((col, row) => row * N + col);
    const wrong = states.findIndex((s, i) => s === 'cat' && !solution.includes(i));
    if (wrong !== -1) {
      highlighted = wrong;
      show('Try removing the cat in row ' + (getRow(wrong) + 1) + ', column ' + (getCol(wrong) + 1) + '.');
      return;
    }
    const next = solution.find(i => states[i] !== 'cat');
    if (next === undefined) { show(); return; }
    highlighted = next;
    show('Try a cat in row ' + (getRow(next) + 1) + ', column ' + (getCol(next) + 1) + '.');
  });
  load('Select a tile to place a cat.');
}
