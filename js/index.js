// By default, the first board loaded by your page will be the same 
// each time you load (which is accomplished by "seeding" the random
// number generator. This makes testing (and grading!) easier!
Math.seedrandom(0);

// constants
const MIN_BOARD_SIZE     = 3;
const DEFAULT_BOARD_SIZE = 8;
const MAX_BOARD_SIZE     = 20;
const TIMEOUT_REPOPULATE = 500;
const DIRECTIONS         = ["left","up","right","down"];
const ARROW_KEY_CODES    = [37, 38, 39, 40];
const CELL_COLORS        = ["yellow", "red", "purple", "blue", "orange", "green"];
const ENTER_KEY          = 13;
const CHAR_CODE_A        = 97;

// data model at global scope for easier debugging
var board;
var rules;

// initialize board
var url_var_size = parseInt($.getUrlVar('size'));
if (url_var_size >= MIN_BOARD_SIZE && url_var_size <= MAX_BOARD_SIZE) {
    board = new Board(url_var_size);
} else {
    board = new Board(DEFAULT_BOARD_SIZE);
}

// load a rule
rules = new Rules(board);

// ----------------------------------------------------------------------------
// Utility methods
function ijToCellId(i, j){
  return String.fromCharCode(i + CHAR_CODE_A) + (j+1);
}

function cellIdToIj(cellId){
  var cleanCellId = cellId.toLowerCase().replace(/\s/g,"");
  var i = cleanCellId.charCodeAt(0) - CHAR_CODE_A;
  var j = parseInt(cleanCellId.substring(1,cleanCellId.length)) - 1;
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

function arrowToDirection(keyCode){
  return DIRECTIONS[keyCode - ARROW_KEY_CODES[0]];
}

function setCellToColor(cellId, color){
  if (color === "empty"){
    $( "#" + cellId + " > div > img" ).removeAttr("src");
  } else {
    $( "#" + cellId + " > div > img" ).attr({"src": "graphics/{0}-candy.png".format(color),
                                               "height": "100%",
                                               "width": "100%"});
  }
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
      newRow = newRow + 
          '<td class="cell" id="{0}"><div class="box"><img src={1}></img></div></td>'.format(cellId,"");
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
$(board).on("add", function(evt, info)
{
  // Change the colors of the cell
  var row = info.toRow;
  var col = info.toCol;
  var color = info.candy.color;
  var cellId = ijToCellId(row, col);
  setCellToColor(cellId, color);
});

// move a candy on the board
$(board).on("move", function(evt, info)
{
  // Change the colors of the cell
  var row = info.toRow;
  var col = info.toCol;
  var color = info.candy.color;
  var cellId = ijToCellId(row, col);
  setCellToColor(cellId, color);
});

// remove a candy from the board
$(board).on("remove", function(e, info)
{
  // Change the colors of the cell
  var row = info.fromRow;
  var col = info.fromCol;
  var color = "empty";
  var cellId = ijToCellId(row, col);
  setCellToColor(cellId, color);
});

// update score
$(board).on("scoreUpdate", function(evt, info)
{
    var new_score = info.score;
    var last_crush_color = info.candy.color;
    $( "#span_score" ).text(new_score).css({"color": last_crush_color});
});

// ----------------------------------------------------------------------------
// Button Events
$(document).on("click", "#btn_crush_once", function(evt)
{
  doCrush();
});
$(document).on("click", "#btn_new_game", function(evt)
{
  board.clear();
  board.resetScore();
  rules.prepareNewGame();
  $( "#move_input_text" ).focus();
});
$(document).on("click", "#btn_move_up", function(evt)
{
  processMoveClick("up");
});
$(document).on("click", "#btn_move_left", function(evt)
{
  processMoveClick("left");
});
$(document).on("click", "#btn_move_right", function(evt)
{
  processMoveClick("right");
});
$(document).on("click", "#btn_move_down", function(evt)
{
  processMoveClick("down");
});

// keyboard events arrive here
$(document).on("keyup", function(evt) {
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
