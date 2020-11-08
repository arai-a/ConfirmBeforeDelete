// Import any needed modules.
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Load an additional JavaScript file.
Services.scriptloader.loadSubScript("chrome://confirmbeforedelete/content/confirmbeforedelete/CBD-common.js", window, "UTF-8");

if (!CBD)
    var CBD = {};

function onLoad(activatedWhileWindowOpen) {
    
    window.CBD.init();
    
    // Delete message
    if (typeof window.DefaultController != "undefined" && typeof defaultControllerDoCommandOrig == "undefined") {
        var defaultControllerDoCommandOrig = window.DefaultController.doCommand;
        window.DefaultController.doCommand = function (command) {
            if (!this.isCommandEnabled(command))
                return;
            switch (command) {
            case "button_delete":
            case "cmd_delete":
                if (CBD.checktrash(false))
                    defaultControllerDoCommandOrig.apply(this, arguments);
                break;
            case "cmd_shiftDelete":
                if (CBD.checktrash(true))
                    defaultControllerDoCommandOrig.apply(this, arguments);
                break;
            default:
                defaultControllerDoCommandOrig.apply(this, arguments);
            }
        };
    }
    
    // Menu move message to trash
    if (typeof window.MsgMoveMessage != "undefined" && typeof MsgMoveMessageOrig == "undefined") {
        var MsgMoveMessageOrig = window.MsgMoveMessage;
        window.MsgMoveMessage = function (aDestFolder) {
            if (window.CBD.isSubTrash(aDestFolder) != 0) {
                if (CBD.deleteLocked() || !window.CBD.confirmbeforedelete ('gotrash'))
                    return;
            }
            MsgMoveMessageOrig.apply(this, arguments);
        };
    }
    
    // case folder delete
    if (typeof window.gFolderTreeController != "undefined" && window.gFolderTreeController.emptyTrash && typeof EmptyTrashOrig == "undefined") {
        var EmptyTrashOrig = window.gFolderTreeController.emptyTrash;
        window.gFolderTreeController.emptyTrash = function (aFolder) {
            if (!CBD.areFoldersLockedWhenEmptyingTrash())
                EmptyTrashOrig.apply(this, arguments);
        };
        var DeleteFolderOrig = window.gFolderTreeController.deleteFolder;
        window.gFolderTreeController.deleteFolder = function () {
            if (window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.folders.lock")) {
                window.alert(window.CBD.bundle.GetStringFromName("lockedFolder"));
                return;
            }
            if (CBD.checkforfolder())
                DeleteFolderOrig.apply(this, arguments);
        };
    }
    
    // case when message is dragged to trash
    if (typeof window.gFolderTreeView != "undefined" && window.gFolderTreeView != null && window.gFolderTreeView.drop && typeof DropInFolderTreeOrig == "undefined") {
        var DropInFolderTreeOrig = window.gFolderTreeView.drop;
        window.gFolderTreeView.drop = function (aRow, aOrientation) {
            let targetFolder = window.gFolderTreeView._rowMap[aRow]._folder;
            if (targetFolder.getFlag(0x00000100)) { // trash flag
                if (window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.delete.lock")) {
                    window.alert(window.CBD.bundle.GetStringFromName("deleteLocked"));
                } else if (window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.gotrash.enable") || window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.protect.enable")) {
                    let dt = this._currentTransfer;
                    // we only lock drag of messages
                    let types = Array.from(dt.mozTypesAt(0));
                    if (types.includes("text/x-moz-message")) {
                        let isMove = Cc["@mozilla.org/widget/dragservice;1"]
                            .getService(Ci.nsIDragService).getCurrentSession()
                            .dragAction == Ci.nsIDragService.DRAGDROP_ACTION_MOVE;
    
                        if (window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.protect.enable")) {
                            let tagKey = window.CBD.prefs.getCharPref("extensions.confirmbeforedelete.protect.tag");
                            let nbMsg = dt.mozItemCount;
                            let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
                            for (let i = 0; i < nbMsg; i++) {
                                let msgHdr = messenger.msgHdrFromURI(dt.mozGetDataAt("text/x-moz-message", i));
                                let keyw = msgHdr.getStringProperty("keywords");
                                if (window.gFolderDisplay.selectedMessages[i].getStringProperty("keywords").indexOf(tagKey) != -1) {
                                    var tagName = window.CBD.tagService.getTagForKey(tagKey);
                                    window.alert(window.CBD.bundle.GetStringFromName("deleteTagLocked1") + " " + tagName + " " + window.CBD.bundle.GetStringFromName("deleteTagLocked2"));
                                    return;
                                }
                            }
                        }
    
                        if (window.CBD.confirmbeforedelete ('gotrash')) {
                            // copy code of folderPane.js because getCurrentSession become null after showing popup
    
                            let count = dt.mozItemCount;
                            let array = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
    
                            let sourceFolder;
                            let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
    
                            for (let i = 0; i < count; i++) {
                                let msgHdr = messenger.msgHdrFromURI(dt.mozGetDataAt("text/x-moz-message", i));
                                if (!i)
                                    sourceFolder = msgHdr.folder;
                                array.appendElement(msgHdr);
                            }
                            let prefBranch = Services.prefs.getBranch("mail.");
    
                            if (!sourceFolder.canDeleteMessages)
                                isMove = false;
    
                            let cs = MailServices.copy;
                            prefBranch.setCharPref("last_msg_movecopy_target_uri", targetFolder.URI);
                            prefBranch.setBoolPref("last_msg_movecopy_was_move", isMove);
                            // ### ugh, so this won't work with cross-folder views. We would
                            // really need to partition the messages by folder.
                            cs.CopyMessages(sourceFolder, array, targetFolder, isMove, null, msgWindow, true);
                        }
                    } else {
                        DropInFolderTreeOrig.apply(this, arguments);
                    }
                } else {
                    DropInFolderTreeOrig.apply(this, arguments);
                }
            } else {
                DropInFolderTreeOrig.apply(this, arguments);
            }
        }
    }
}

function onUnload(deactivatedWhileWindowOpen) {
  // Cleaning up the window UI is only needed when the
  // add-on is being deactivated/removed while the window
  // is still open. It can be skipped otherwise.
  if (!deactivatedWhileWindowOpen) {
    return
  }
}


// calendar
if (typeof calendarViewController != "undefined" && typeof calendarViewControllerDeleteOccurrencesOrig == "undefined") {
    var calendarViewControllerDeleteOccurrencesOrig = calendarViewController.deleteOccurrences;
    calendarViewController.deleteOccurrences = function (aCount, aUseParentItems, aDoNotConfirm) {
        if (CBD.checkForCalendar())
            calendarViewControllerDeleteOccurrencesOrig.apply(this, arguments);
    };
}

// Address Book
if (typeof AbDelete != "undefined" && typeof AbDeleteOrig110807 == "undefined") {
    var AbDeleteOrig110807 = AbDelete;
    AbDelete = function () {
        var selectedDir = GetSelectedDirectory();
        var isList = GetDirectoryFromURI(selectedDir).isMailList
            var types = GetSelectedCardTypes();
        if (types == kNothingSelected)
            return;
        var enableConfirm = window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.addressbook.enable");
        var param = isList ? "contactyesno2" : "contactyesno";
        if (types == kCardsOnly && enableConfirm && !window.CBD.confirmbeforedelete (param))
            return;
        AbDeleteOrig110807.apply(this, arguments);
    };
}



CBD.areFoldersLockedWhenEmptyingTrash = function () {
    if (!window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.folders.lock"))
        return false;
    try {
        var msgFolder = window.GetSelectedMsgFolders()[0];
        if (msgFolder) {
            var rootFolder = msgFolder.rootFolder;
            var len = {};
            if (rootFolder.getFoldersWithFlag)
                var trashFolder = rootFolder.getFoldersWithFlag(0x00000100, 1, len);
            else
                // TB3 syntax
                var trashFolder = msgFolder.getFolderWithFlags(0x00000100);
            if (trashFolder && trashFolder.hasSubFolders) {
                window.alert(window.CBD.bundle.GetStringFromName("cantEmptyTrash") + window.CBD.bundle.GetStringFromName("lockedFolder"));
                return true;
            }
        }
    } catch (e) {}
    return false;
}

CBD.checkforfolder = function () {
    var folder = window.GetSelectedMsgFolders()[0];
    var folderSubTrash = window.CBD.isSubTrash(folder);
    if (folderSubTrash && window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.delete.enable"))
        return window.CBD.confirmbeforedelete ('folderyesno');
    else
        return true;
}

CBD.deleteLocked = function () {
    try {
        if (window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.delete.lock")) {
            window.alert(window.CBD.bundle.GetStringFromName("deleteLocked"));
            return true;
        } else if (window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.protect.enable")) {
            let tagKey = window.CBD.prefs.getCharPref("extensions.confirmbeforedelete.protect.tag");
            let nbMsg = window.gFolderDisplay.selectedCount;
            for (let i = 0; i < nbMsg; i++) {
                let keyw = window.gFolderDisplay.selectedMessages[i].getStringProperty("keywords");
                if (window.gFolderDisplay.selectedMessages[i].getStringProperty("keywords").indexOf(tagKey) != -1) {
                    var tagName = window.CBD.tagService.getTagForKey(tagKey);
                    window.alert(window.CBD.bundle.GetStringFromName("deleteTagLocked1") + " " + tagName + " " + window.CBD.bundle.GetStringFromName("deleteTagLocked2"));
                    return true;
                }
            }
        }
    } catch (e) {
        window.alert(e);
    }
    return false;
}

CBD.checktrash = function (isButtonDeleteWithShift) {
    try {
        if (CBD.deleteLocked())
            return false;

        var msgFol = window.GetSelectedMsgFolders()[0];
        if (!msgFol)
            return true;
        if (isButtonDeleteWithShift)
            return window.CBD.checkforshift();

        var folderTrash = (msgFol.flags & 0x00000100);
        var folderSubTrash = window.CBD.isSubTrash(msgFol);
        var isTreeFocused = false;

        if (document.getElementById("folderTree") &&
            document.getElementById("folderTree").getAttribute("focusring") == "true")
            isTreeFocused = true;

        try {
            var prefDM = "mail.server." + msgFol.server.key + ".delete_model";
            if (!folderTrash && window.CBD.prefs.getPrefType(prefDM) > 0 && window.CBD.prefs.getIntPref(prefDM) == 2)
                folderTrash = true;
        } catch (e) {}

        if (folderTrash && window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.delete.enable"))
            return window.CBD.confirmbeforedelete ('mailyesno');
        else if (folderSubTrash && isTreeFocused && window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.delete.enable"))
            return window.CBD.confirmbeforedelete ('folderyesno');
        else if (!folderTrash && window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.gotrash.enable"))
            return window.CBD.confirmbeforedelete ('gotrash');
        else
            return true;
    } catch (e) {
        window.alert(e);
    }
}

CBD.checkForCalendar = function () {
    if (!window.CBD.prefs.getBoolPref("extensions.confirmbeforedelete.calendar.enable"))
        return true;
    else
        return window.CBD.confirmbeforedelete ('deleteCalendar');
}