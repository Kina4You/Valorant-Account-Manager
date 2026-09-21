package com.valorant;

import org.springframework.boot.web.context.WebServerInitializedEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.stereotype.Component;

/**
 * Meldet den tatsächlich vergebenen Port an Electron.
 *
 * Weil {@code server.port=0} gesetzt ist, sucht das Betriebssystem einen freien
 * Port aus und reserviert ihn für diesen Prozess. Damit kann kein fremdes
 * Programm den Port vorher belegen und sich als unser Backend ausgeben.
 *
 * Electron liest die Zeile {@code VM_PORT=<nummer>} aus der Standardausgabe.
 */
@Component
public class PortReporter implements ApplicationListener<WebServerInitializedEvent> {

    @Override
    public void onApplicationEvent(WebServerInitializedEvent event) {
        int port = event.getWebServer().getPort();
        // Feste, maschinenlesbare Zeile — Electron sucht genau nach diesem Muster
        System.out.println("VM_PORT=" + port);
        System.out.flush();
    }
}
