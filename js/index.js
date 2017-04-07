// By default, the first board loaded by your page will be the same 
// each time you load (which is accomplished by "seeding" the random
// number generator. This makes testing (and grading!) easier!
Math.seedrandom(0);

// constants
const BOARD_SIZE_PX           = 320;
const MIN_BOARD_SIZE          = 3;
const DEFAULT_BOARD_SIZE      = 8;
const MAX_BOARD_SIZE          = 20;
const DIRECTIONS              = ["left","up","right","down"];
const ARROW_KEY_CODES         = [37, 38, 39, 40];
const CELL_COLORS             = ["yellow", "red", "purple", "blue", "orange", "green"];
const ENTER_KEY               = 13;
const CHAR_CODE_A             = 97;
const MOVE_ANIMATION_DURATION = 400;
const REMV_ANIMATION_DURATION = 400;
const SCORE_UPDATE_TIMEOUT    = 100;
const Z_INDEX_DEFAULT         = 30;

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

// state variables to let us keep track of animations
var preparing_new_game;
var number_removing = 0;
var number_moving = 0;
var dragging = null;

// load a rule
rules = new Rules(board);

// ----------------------------------------------------------------------------
// Utility methods
function ijToCellId(i, j) {
  return String.fromCharCode(i + CHAR_CODE_A) + (j+1);
}

function cellIdToIj(cellId) {
  var cleanCellId = cellId.toLowerCase().replace(/\s/g,"");
  var i = cleanCellId.charCodeAt(0) - CHAR_CODE_A;
  var j = parseInt(cleanCellId.substring(1,cleanCellId.length)) - 1;
  return [i, j];
}

function cellIdToCandy(cellId) {
  var loc = cellIdToIj(cellId);
  return board.getCandyAt(loc[0], loc[1]);
}

/**
 * Input text is valid to refer to cell if
 * - contains exactly two consecutive non-whitespace characters
 * - can parse characters without error
 * - coordinates fit in board size
 */
function isValidCell(input_text) {
  try {
    var loc = cellIdToIj(input_text);
    if (!( (0 <= loc[0]) && (loc[0] < board.getSize()) &&
           (0 <= loc[1]) && (loc[1] < board.getSize()) )){
            return false;
          }
  } catch(err) {
    return false;
  }

  return true;
}

function arrowToDirection(keyCode) {
  return DIRECTIONS[keyCode - ARROW_KEY_CODES[0]];
}

function setCellToColor(cellId, color) {
  if (color === "empty"){
    //pass
  } else {
    $( cellSelectorString(cellId) ).attr({
      "src"    : "graphics/{0}-candy.png".format(color),
      "height" : "100%",
      "width"  : "100%"
    });
  }
}

// ----------------------------------------------------------------------------
// Enable/disable input controls

function disableButton(id) {
  $( "#" + id ).removeClass("btn_enabled").addClass("btn_disabled");
}

function enableButton(id) {
  $( "#" + id ).removeClass("btn_disabled").addClass("btn_enabled");
}

function disableMoveButton(direction) {
  disableButton("btn_move_" + direction);
}

function enableMoveButton(direction) {
  enableButton("btn_move_" + direction);
}

function disableMoveInput() {
  $( "#move_input_text" ).prop("disabled", true);
}

function enableMoveInput() {
  $( "#move_input_text" ).prop("disabled", false);
}

// ----------------------------------------------------------------------------
// Animation

/**
 * Draw arrow from point (x,y) with length l in direction dir.
 * Can also modify the parameters tw (tail width) and f (fraction of arrow taken
 * up by head).
 */
function drawArrow(x,y,l,dir) {
  ctx.save();

  var tw = 8;
  var f = 0.5;

  ctx.translate(x,y);

  if (dir === "left"){
    ctx.rotate(Math.PI);
  } else if (dir === "right"){
    // pass
  } else if (dir === "up"){
    ctx.rotate(-Math.PI/2);
  } else if (dir === "down"){
    ctx.rotate(Math.PI/2);
  }

  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.lineTo(0, -tw/2);
  ctx.lineTo(l*(1-f), -tw/2);
  ctx.lineTo(l*(1-f), -tw);
  ctx.lineTo(l, 0);
  ctx.lineTo(l*(1-f), tw);
  ctx.lineTo(l*(1-f), tw/2);
  ctx.lineTo(0, tw/2);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

/**
 * Clear the entire canvas, ensuring that prior modifications to the
 * transformation matrix do not mess up.
 */
function clearCanvas() {
  ctx.save();
  ctx.setTransform(1,0,0,1,0,0);
  var canvas = document.getElementById("canvas");
  ctx.clearRect(0,0,canvas.width, canvas.height);
  ctx.restore();
}

/**
 * Disable/enable buttons during/for the process/completion of computing and drawing the crushes
 * on the board.
 */
function setCrushing(bool) {
  if (bool) {
    // Disable arrows
    DIRECTIONS.forEach(function(entry){
      disableMoveButton(entry);
    });
    $( "#" + "move_input_text" ).val("");
    disableMoveInput();
  } else {
    enableMoveInput();
    $( "#" + "move_input_text" ).focus();
  }
}

/**
 * Animate a candy to move from one cell to another. Also handles the case of
 * an add, in which case the origin cell is set to above the table.
 */
function animateMove(fromRow, fromCol, row, col, color){
  number_moving++;

  var cellId = ijToCellId(row, col);

  var cw = BOARD_SIZE_PX / board.getSize();
  var dx = (fromCol - col) * cw;
  var dy = (fromRow - row) * cw;

  $( cellSelectorString(cellId) )
    .queue(function() {
      setCellToColor(cellId, color);
      $(this).css({
        opacity: 1,
        top: "{0}px".format(dy),
        left: "{0}px".format(dx)
      });
      $(this).dequeue(); })
    .animate({
        top: "0px",
        left: "0px"
      },
      MOVE_ANIMATION_DURATION,
      "swing",
      function(){ 
        number_moving--;
      }
    );
}

/**
 * At least one crush is available.
 */
function canCrush() {
  return rules.getCandyCrushes().length > 0;
}

/**
 * Process crush
 * - remove crushes
 * - poll until complete
 * - move candies down
 * - poll until complete
 * - if more crushes are available, crush again
 * - else, re-enable controls
 */
function doCrush() {
  // Can we actually crush?
  if (canCrush()){
    var crushes = rules.getCandyCrushes();
    rules.removeCrushes(crushes);

    // Poll until crushes are done removing.
    setTimeout(function(){}, 10);
    poll(function() {
      return number_removing === 0;
    }, 10000, 20).then(function() {
      rules.moveCandiesDown();

      setTimeout(function(){}, 10);
      poll(function() {
        return number_moving === 0;
      }, 10000, 20).then(function(){
        if (canCrush()){
          doCrush();
        } else {
          setCrushing(false);
        }
      }).catch(function() {
        //console.log("Timed out waiting for moving candies.");
      });

    }).catch(function() {
      //console.log("Timed out waiting for removing candies.");
    });


  }
}


// ----------------------------------------------------------------------------
// Input logic

/**
 * Function called to handle case where Show Move button is pressed but no valid
 * moves remain. We show a popup and force user to click New Game.
 */
function processNoValidMovesRemain() {
  window.alert("No valid moves remain. Try a new game!");
  $(".btn").removeClass("btn_enabled").addClass("btn_disabled");
  $("#btn_new_game").removeClass("btn_disabled").addClass("btn_enabled");
}

/**
 * Get a move, draw an arrow.
 */
function processShowMove(evt) {
  clearCanvas();

  var move = rules.getRandomValidMove();
  if (!move){
    processNoValidMovesRemain();
  } else {
    var w = BOARD_SIZE_PX / board.getSize();
    var x = move.candy.col * w + w/2;
    var y = move.candy.row * w + w/2;
    var d = move.direction;
    drawArrow(x,y,w,d);
  }
}

/**
 * Get cell that was clicked and populated move input text box.
 */
function gameTableClickHandler(evt){
  var id = evt.currentTarget.id;
  $( "#move_input_text" ).val(id);

  // Handle a fake keyup event to the move input text box to avoid redoing the
  // logic.
  processInputKeyup();
}

/** 
 * We get a click event on our movement arrow buttons. 
 * - do some validation on desired move
 * - check that the desired move is allowed by the rules
 * - flip the candies in question
 * - poll until candies are flipped, then do crush
 */
function processMoveClick(direction) {
  if ( ! $( "#" + "btn_move_" + direction).hasClass("btn_disabled")) {
    var input_text = $( "#move_input_text" ).val();
    if (isValidCell(input_text)){
      var candy = cellIdToCandy(input_text);
      if (rules.isMoveTypeValid(candy, direction)){
        var toCandy = board.getCandyInDirection(candy, direction);

        setCrushing(true);
        board.flipCandies(candy, toCandy);

        setTimeout(function(){},10);
        poll(function(){
          return number_moving === 0;
        }, 10000, 20).then(function() {
          doCrush();
        }).catch(function() {
          //console.log("Timed out waiting for flipping candies.");
        });
      }
    }
  }
}

/**
 * A keyup event has originated from the input text area. Check that a
 * a valid cell is entered with an associated valid move. If so, we enable the
 * appropriate buttons.
 */
function processInputKeyup() {
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

/**
 * Fill in the game table with appropriate td and tr elements.
 * We also add mouse press listeners to these elements.
 */
function createGameTable() {
  for (var i=0; i<board.getSize(); i++){
    var newRow = "<tr>";
    for (var j=0; j<board.getSize(); j++){
      // Prepare 
      var cellId = ijToCellId(i,j);
      newRow = newRow + 
        '<td class="cell" id="{0}"><div class="box"><div class="box1"><img style="position: absolute; top: 0px; left: 0px;" src={1}></img></div></div></td>'.format(cellId,"");
    }
    newRow = newRow + "</tr>";
    $( "#game_table > tbody" ).append(newRow);
  }

  // Add click handlers.
  $( "#game_table > tbody > tr > td" ).click(gameTableClickHandler);

  // Init canvas context.
  var canvas = document.getElementById("canvas");
  ctx = canvas.getContext("2d");
}

function cellSelectorString(cellId) {
  return "#" + cellId + " > div > div > img";
}


/**
 * Final initialization entry point: the Javascript code inside this block
 * runs at the end of start-up when the page has finished loading.
 */
$(document).ready(function() {
  preparing_new_game = true;

  // Create game table
  createGameTable();

  // Generate candies
  rules.prepareNewGame();

  // Initialize with focus on input
  $( "#move_input_text" ).focus();

  preparing_new_game = false;
});

// ----------------------------------------------------------------------------
// Event handlers

// add a candy to the board
$(board).on("add", function(evt, info) {
  // Change the colors of the cell
  var fromRow = -1;
  var fromCol = col;
  var row     = info.toRow;
  var col     = info.toCol;
  var color   = info.candy.color;

  if (!preparing_new_game){
    animateMove(fromRow, fromCol, row, col, color);
  } else {
    var cellId = ijToCellId(row, col);
    setCellToColor(cellId, color);
    $( cellSelectorString(cellId) ).queue(function(){
      $(this).css({opacity: 1});
      $(this).dequeue();
    });
  }
});

// move a candy on the board
$(board).on("move", function(evt, info) {
  // Change the colors of the cell
  var fromRow = info.fromRow;
  var fromCol = info.fromCol;
  var row     = info.toRow;
  var col     = info.toCol;
  var color   = info.candy.color;

  animateMove(fromRow, fromCol, row, col, color);
});

// remove a candy from the board
$(board).on("remove", function(evt, info) {
  if (!preparing_new_game){
    number_removing++;
  }

  // Change the colors of the cell
  var row = info.fromRow;
  var col = info.fromCol;
  var cellId = ijToCellId(row, col);

  if (!preparing_new_game){
    $( cellSelectorString(cellId) ).animate(
      { opacity: [0, "swing"] },
      REMV_ANIMATION_DURATION,
      function() {
        number_removing--;
      }
    );
  } else {
    $( cellSelectorString(cellId) ).queue(function(){
      $(this).css({opacity: 0});
      $(this).dequeue();
    });
  }
});

// update score
$(board).on("scoreUpdate", function(evt, info) {
  // Poll for removing complete
  poll(function() {
    return number_removing === 0;
  }, 10000, 20).then(function() {
    setTimeout(function(){
      var new_score = info.score;
      $( "#span_score" ).text(new_score);
      if (info.candy){
        var last_crush_color = info.candy.color;
        $( "#span_score_wrapper" ).css({"background-color": last_crush_color});
        if (last_crush_color === "yellow"){
          $( "span_score" ).css({"color":"black"});
        } else {
          $( "span_score" ).css({"color":"white"});
        }
      } else {
        $( "#span_score_wrapper" ).css({"background-color": "#999999"});
      }
    }, SCORE_UPDATE_TIMEOUT);
  }).catch(function() {
    //console.log("Timed out waiting for removing candies.");
  });
});

// ----------------------------------------------------------------------------
// Button Events

$(document).on("click", "#btn_new_game", function(evt) {
  preparing_new_game = true;
  board.clear();
  board.resetScore();
  rules.prepareNewGame();
  $( "#move_input_text" ).focus();
  $("#btn_show_move").removeClass("btn_disabled btn_enabled");
  $("#btn_new_game").removeClass("btn_disabled btn_enabled");
  preparing_new_game = false;
});
$(document).on("click", "#btn_show_move", function(evt){
  processShowMove(evt);
});
$(document).on("click", "#btn_move_up", function(evt) {
  processMoveClick("up");
});
$(document).on("click", "#btn_move_left", function(evt) {
  processMoveClick("left");
});
$(document).on("click", "#btn_move_right", function(evt) {
  processMoveClick("right");
});
$(document).on("click", "#btn_move_down", function(evt) {
  processMoveClick("down");
});
$(document).on("keyup", function(evt) {
  if ($.inArray(evt.which, ARROW_KEY_CODES) != -1) {
    clearCanvas();
    processMoveClick(arrowToDirection(evt.which));
  } else if (evt.target.id == "move_input_text"){
    // Is this coming directly from the move_input_text?
    // Delegate to move-specific handler, to check contents of text area.
    processInputKeyup();
  }
});

// Clear canvas once any button *but* "Show Move" is pressed.
$(document).on("click", ".btn", function(evt){
  if (evt.target.id !== "btn_show_move"){
    clearCanvas();
  }
});

// Log mouse events on images.
$(document).on("mousedown", "img", function(evt) {
  // validate that it is the right type of image.
  evt.preventDefault();

  var cellPos = $(evt.target).offset();
  var dx = evt.pageX - cellPos.left;
  var dy = evt.pageY - cellPos.top;
  dragging = { target: evt.target, dx: dx, dy: dy };
  $(dragging.target).css("z-index", Z_INDEX_DEFAULT*2);
  console.log("beginning drag");

  // // prepare to drag the candy
  // //   - record the original position of the candy? of the mouse?
  // var cellPos = $(evt.target).offset();
  // $(evt.target).data("x", cellPos.left);
  // $(evt.target).data("y", cellPos.top);

  // //   - set the z-index of the element so that it drags on top of everything else
  // $(evt.target).css({"z-index": 60});

  // // var cell_id = $(evt.target).parent().parent().parent().attr("id");
});
$(document).on("mousemove", "img", function(evt) {
  evt.preventDefault();
  if (dragging){
    $(dragging.target).offset({
      left : evt.pageX - dragging.dx,
      top  : evt.pageY - dragging.dy
    });

    // // move the candy.
    // // 1. get the x,y position of the mouse on the screen
    // var x = evt.screenX;
    // var y = evt.screenY;

    // // 2. get the position of the original cell
    // var cellX = $(evt.target).data("x");
    // var cellY = $(evt.target).data("y");
    // 
    // var dy = y - cellY;
    // var dx = x - cellX;

    // // 3. adjust the top and left css properties, accounting for this offset,
    // //     to match the position of the mouse
    // $(evt.target).css({
    //     top: "{0}px".format(dy),
    //     left: "{0}px".format(dx)
    // });
  }
});
$(document).on("mouseup", "img", function(evt) {
  evt.preventDefault();
  $(dragging).css("z-index", Z_INDEX_DEFAULT);
  dragging = null;
  console.log("ending drag");
  // release the candy ("A").
  // case 1: the mouse is still within A's original square
  //   - reset top and left position to original
  //   - reset z-index
  // case 2: the mouse is outside of the grid entirely
  //   - reset top and left position to original
  //   - reset z-index
  // case 3: the mouse is within the square of a different candy ("B").
  //   - immediately begin the animation of moving B to A's square
  //   - set the top and left position of A to B's square
  //   - reset z-index
});
