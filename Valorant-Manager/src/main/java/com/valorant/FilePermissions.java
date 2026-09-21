package com.valorant;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.AclEntry;
import java.nio.file.attribute.AclEntryPermission;
import java.nio.file.attribute.AclEntryType;
import java.nio.file.attribute.AclFileAttributeView;
import java.nio.file.attribute.PosixFilePermissions;
import java.nio.file.attribute.UserPrincipal;
import java.util.EnumSet;
import java.util.List;

/**
 * Schränkt Dateirechte auf den Besitzer ein — auf beiden Plattformen.
 *
 * macOS/Linux: POSIX-Rechte 600 bzw. 700.
 * Windows: kennt kein POSIX. Dort wird stattdessen die Zugriffsliste (ACL)
 *          so gesetzt, dass ausschliesslich der Besitzer Rechte hat. Ohne das
 *          blieben die Dateien für Administratoren des Rechners lesbar.
 */
public final class FilePermissions {

    private FilePermissions() { }

    /** Nur der Besitzer darf lesen und schreiben. */
    public static void ownerOnly(Path path) {
        ownerOnly(path, false);
    }

    /** Wie {@link #ownerOnly(Path)}, mit {@code directory=true} zusätzlich betretbar. */
    public static void ownerOnly(Path path, boolean directory) {
        if (applyPosix(path, directory)) return;
        if (applyAcl(path)) return;
        System.out.println("[Rechte] Konnte Zugriff auf " + path.getFileName()
            + " nicht einschränken — das Betriebssystem bietet keinen der beiden Wege.");
    }

    private static boolean applyPosix(Path path, boolean directory) {
        try {
            Files.setPosixFilePermissions(path,
                PosixFilePermissions.fromString(directory ? "rwx------" : "rw-------"));
            return true;
        } catch (UnsupportedOperationException e) {
            return false; // Windows — weiter mit der ACL
        } catch (Exception e) {
            System.out.println("[Rechte] POSIX fehlgeschlagen für " + path.getFileName()
                + ": " + e.getMessage());
            return false;
        }
    }

    private static boolean applyAcl(Path path) {
        try {
            AclFileAttributeView view = Files.getFileAttributeView(path, AclFileAttributeView.class);
            if (view == null) return false;

            UserPrincipal owner = Files.getOwner(path);
            AclEntry onlyOwner = AclEntry.newBuilder()
                .setType(AclEntryType.ALLOW)
                .setPrincipal(owner)
                .setPermissions(EnumSet.allOf(AclEntryPermission.class))
                .build();

            // Liste vollständig ersetzen: alles andere — auch geerbte Einträge
            // für Administratoren und SYSTEM — fällt damit weg.
            view.setAcl(List.of(onlyOwner));
            return true;
        } catch (Exception e) {
            System.out.println("[Rechte] ACL fehlgeschlagen für " + path.getFileName()
                + ": " + e.getMessage());
            return false;
        }
    }
}
