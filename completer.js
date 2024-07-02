const lsp_server = prompt("Enter the url of your lsp server")
const socket = io(lsp_server);

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

setTimeout(5000, () => {
  const editorId = activeTab.getAttribute("data-editor-id");
  const activeEditor = ace.edit(editorId);
  return activeEditor;
})

// Custom completer that uses the server for completions
const serverCompleter = {
  getCompletions: function(activeEditor, session, pos, prefix, callback) {
    const cursorPosition = activeEditor.getCursorPosition();
    const currentLine = activeEditor.session.getLine(cursorPosition.row);
    const textBeforeCursor = currentLine.slice(0, cursorPosition.column);

    // Only request completions if the user has typed at least 3 characters
    if (textBeforeCursor.length >= 3) {
      socket.emit('completions', { text: textBeforeCursor }, (suggestions) => {
        const completions = suggestions.map(suggestion => ({
          caption: suggestion,
          value: suggestion,
          meta: "server"
        }));
        callback(null, completions);
      });
    } else {
      callback(null, []);
    }
  }
};

// Add the custom completer to Ace's list of completers
const langTools = ace.require("ace/ext/language_tools");
langTools.addCompleter(serverCompleter);

// Set up custom worker for linting
const { EditSession, WorkerClient } = ace.require("ace/worker/worker_client");
const oop = ace.require("ace/lib/oop");

const CustomWorker = function(sender) {
  WorkerClient.call(this, ["ace"], "ace/mode/python_worker", sender);
  this.attachToDocument(sender.getDocument());

  this.send("lint", sender.getValue());

  this.sender.on("change", (e) => {
    this.send("lint", sender.getValue());
  });
};

oop.inherits(CustomWorker, WorkerClient);

(function() {
  this.onMessage = function(e) {
    const { data } = e;
    if (data.type === "lint") {
      this.sender.emit("lint", data.errors);
    }
  };

  this.lint = function(text) {
    socket.emit('lint', { text }, (errors) => {
      this.sender.emit("lint", errors);
    });
  };
}).call(CustomWorker.prototype);

const Mode = ace.require("ace/mode/python").Mode;
const oldCreateWorker = Mode.prototype.createWorker;
Mode.prototype.createWorker = function(session) {
  return new CustomWorker(session);
};

activeEditor.getSession().setAnnotations([]);
activeEditor.getSession().on("lint", function(annotations) {
  activeEditor.getSession().setAnnotations(annotations.map(ann => ({
    row: ann.line - 1,
    column: ann.column,
    text: ann.message,
    type: "error"
  })));
});
