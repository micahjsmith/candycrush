// By default, the first board loaded by your page will be the same 
// each time you load (which is accomplished by "seeding" the random
// number generator. This makes testing (and grading!) easier!
Math.seedrandom(0);

// A short jQuery extension to read query parameters from the URL.
$.extend({
  getUrlVars: function() {
    var vars = [], pair;
    var pairs = window.location.search.substr(1).split('&');
    for (var i = 0; i < pairs.length; i++) {
      pair = pairs[i].split('=');
      vars.push(pair[0]);
      vars[pair[0]] = pair[1] &&
          decodeURIComponent(pair[1].replace(/\+/g, ' '));
    }
    return vars;
  },
  getUrlVar: function(name) {
    return $.getUrlVars()[name];
  }
});

// constants
var DEFAULT_BOARD_SIZE = 8;
var TIMEOUT_REPOPULATE = 500;
var DIRECTIONS         = ["up","down","right","left"];
var ARROW_KEY_CODES    = [37, 40, 39, 38];
var ENTER_KEY          = 13;
var CHAR_CODE_A        = 97;
var CHAR_CODE_1        = 49;

// data model at global scope for easier debugging
var board;
var rules;

// initialize board
if ($.getUrlVar('size') && $.getUrlVar('size') >= 3) {
  board = new Board($.getUrlVar('size'));
} else {
  board = new Board(DEFAULT_BOARD_SIZE);
}

// load a rule
rules = new Rules(board);

// Other globals
var charDictionary = { 0: 'a', 1: 'b', 2: 'c', 3: 'd',
                       4: 'e', 5: 'f', 6: 'g', 7: 'h'}; 

// ----------------------------------------------------------------------------
// Utility methods
function ijToCellId(i, j){
  return String.fromCharCode(i + CHAR_CODE_A) + (j+1);
}

function cellIdToIj(cellId){
  var cleanCellId = cellId.trim().toLowerCase();
  var i = cleanCellId.charCodeAt(0) - CHAR_CODE_A;
  var j = cleanCellId.charCodeAt(1) - CHAR_CODE_1;
  return [i, j];
}

function cellIdToCandy(cellId){
  var loc = cellIdToIj(cellId);
  return board.getCandyAt(loc[0], loc[1]);
}

// Input text is valid to refer to cell if
// - contains exactly two consecutive non-whitespace characters
// - can parse characters without error
// - coordinates fit in board size
function isValidCell(input_text){
  if (input_text.trim().length != 2){
    return false;
  }

  try {
    var loc = cellIdToIj(input_text);
    if (!(0 <= loc[0] < board.getSize() &&
          0 <= loc[1] < board.getSize())){
      return false;
    }
  } catch(err) {
    return false;
  }

  return true;
}

function arrowToDirection(which){
  switch (which)
  {
    case 37: {
      return "left"; 
    }
    case 38: {
      return "up"; 
    }
    case 39: {
      return "right"; 
    }
    case 40: {
      return "down"; 
    }
  }
}

function setCellToColor(cellId, color){
  var color_class = "cell_" + color;
  // TODO be careful
  $( "#" + cellId ).removeClass().addClass(color_class);
}

// ----------------------------------------------------------------------------
// Enable/disable input controls
function disableButton(id){
  $( "#" + id ).removeClass("btn_enabled").addClass("btn_disabled");
}

function enableButton(id){
  $( "#" + id ).removeClass("btn_disabled").addClass("btn_enabled");
}

function disableMoveButton(direction){
  disableButton("btn_move_" + direction);
}

function enableMoveButton(direction){
  enableButton("btn_move_" + direction);
}

function disableMoveInput() {
  $( "#move_input_text" ).prop("disabled", true);
}

function enableMoveInput() {
  $( "#move_input_text" ).prop("disabled", false);
}

// ----------------------------------------------------------------------------
// Input logic

// We get a click event on our movement arrow buttons. 
// - do some validation that the button is not disabled and the input text is a
//   valid cell
// - check that the desired move is allowed by the rules
// - flip the candies in question
// - modify input controls to force a crush
function processMoveClick(direction) {
  if ( ! $( "#" + "btn_move_" + direction).hasClass("btn_disabled")) {
    var input_text = $( "#move_input_text" ).val();
    if (isValidCell(input_text)){
      var candy = cellIdToCandy(input_text);
      if (rules.isMoveTypeValid(candy, direction)){
        var toCandy = board.getCandyInDirection(candy, direction);
        board.flipCandies(candy, toCandy);
        mustCrush(true);
      }
    }
  }
}

// A keyup event has originated from the input text area. Check that a
// a valid cell is entered with an associated valid move. If so, we enable the
// appropriate buttons.
function processInputKeyup(){
  var input_text = $( "#move_input_text" ).val();
  if (isValidCell(input_text)){
    var candy = cellIdToCandy(input_text);
    DIRECTIONS.forEach(function(entry){
      if (rules.isMoveTypeValid(candy, entry)){
        enableMoveButton(entry);
        return;
      } else {
        disableMoveButton(entry);
      }
    });
  }
}

// Disable/enable buttons during/for the process/completion of computing and drawing the crushes
// on the board.
function setCrushing(bool){
  if (bool) {
    disableButton("btn_crush_once");
    $( "#" + "move_input_text" ).val("");
    disableMoveInput();
  } else {
    enableMoveInput();
    $( "#" + "move_input_text" ).focus();
  }
}

// A crush is available on the board. Disable everything except the crush
// button, which we also put in focus.
function mustCrush(bool){
  if (bool) {
    // Enable and focus crush button
    enableButton("btn_crush_once");
    $( "#btn_crush_once" ).focus();

    // Disable arrows
    DIRECTIONS.forEach(function(entry){
      disableMoveButton(entry);
    });

    // Disable and clear form
    $( "#move_input_text" ).val("");
    disableMoveInput();
  }
}

// At least one crush is available.
function canCrush(){
  return rules.getCandyCrushes().length > 0;
}

// Process crush
// - remove crushes
// - disable controls
// - move candies down
// - if more crushes are available, force another crush
// - else, re-enable controls
function doCrush(){
  // Can we actually crush?
  if (canCrush()){
    var crushes = rules.getCandyCrushes();
    rules.removeCrushes(crushes);

    // Dumb asynchronous stuff
    // Do this with promises? http://stackoverflow.com/a/18625565/2514228
    setCrushing(true);
    setTimeout(function() {
      rules.moveCandiesDown();
      if (canCrush()){
        mustCrush(true);
      } else {
        setCrushing(false);
      }
    }, TIMEOUT_REPOPULATE);
  }
}

// Fill in the game table with appropriate td and tr elements.
function createGameTable() {
  for (var i=0; i<board.getSize(); i++){
    var newRow = "<tr>";
    for (var j=0; j<board.getSize(); j++){
      // Prepare 
      var cellId = ijToCellId(i,j);
      newRow = newRow + "<td id=" + '"' + cellId + '">' +
                      cellId + "</td>";
    }
    newRow = newRow + "</tr>";
    $( "#game_table > tbody" ).append(newRow);
  }
}

// Final initialization entry point: the Javascript code inside this block
// runs at the end of start-up when the page has finished loading.
$(document).ready(function()
{
  // Create game table
  createGameTable();

  // Generate candies
  rules.prepareNewGame();

  // Initialize with focus on input
  $( "#move_input_text" ).focus();
});

/* Event Handlers */
// access the candy object with info.candy

// add a candy to the board
$(board).on('add', function(e, info)
{
  // Change the colors of the cell
  var row = info.toRow;
  var col = info.toCol;
  var color = info.candy.color;
  var cellId = ijToCellId(row, col);
  setCellToColor(cellId, color);
});

// move a candy on the board
$(board).on('move', function(e, info)
{
  // Change the colors of the cell
  var row = info.toRow;
  var col = info.toCol;
  var color = info.candy.color;
  var cellId = ijToCellId(row, col);
  setCellToColor(cellId, color);
});

// remove a candy from the board
$(board).on('remove', function(e, info)
{
  // Change the colors of the cell
  var row = info.fromRow;
  var col = info.fromCol;
  var color = "empty";
  var cellId = ijToCellId(row, col);
  setCellToColor(cellId, color);
});

// move a candy on the board
$(board).on('scoreUpdate', function(e, info)
{
  // Your code here. To be implemented in pset 2.
});

// ----------------------------------------------------------------------------
// Button Events
$(document).on('click', "#btn_crush_once", function(evt)
{
  doCrush();
});
$(document).on('click', "#btn_new_game", function(evt)
{
  board.clear();
  board.resetScore();
  rules.prepareNewGame();
  $( "#move_input_text" ).focus();
});
$(document).on('click', "#btn_move_up", function(evt)
{
  processMoveClick("up");
});
$(document).on('click', "#btn_move_left", function(evt)
{
  processMoveClick("left");
});
$(document).on('click', "#btn_move_right", function(evt)
{
  processMoveClick("right");
});
$(document).on('click', "#btn_move_down", function(evt)
{
  processMoveClick("down");
});

// keyboard events arrive here
$(document).on('keyup', function(evt) {
  if ($.inArray(evt.which, ARROW_KEY_CODES) != -1) {
    processMoveClick(arrowToDirection(evt.which));
  } else if (evt.which == ENTER_KEY) {
    doCrush();
  } else if (evt.target.id == "move_input_text"){
    // Is this coming directly from the move_input_text?
    // Delegate to move-specific handler, to check contents of text area.
    processInputKeyup();
  }
});
