package com.valorant;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Lässt nur Anfragen durch, die das Token aus {@link ApiToken} mitbringen.
 *
 * Der Header heißt X-VM-Token. Dass ein eigener Header nötig ist, ist Teil des
 * Schutzes: der Browser muss dafür vorher eine OPTIONS-Anfrage schicken, und
 * eine fremde Webseite kann den Header ohnehin nicht korrekt befüllen.
 */
@Component
public class TokenFilter implements Filter {

    public static final String HEADER = "X-VM-Token";

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;
        String path = req.getRequestURI();

        // Nur die API absichern; alles andere (falls je etwas dazukommt) unberührt lassen
        if (!path.startsWith("/api/")) {
            chain.doFilter(request, response);
            return;
        }

        // Jede Anfrage aus einem Browser-Kontext trägt einen Origin-Header —
        // auch eine Vorabfrage. Unsere App spricht über den Electron-Haupt-
        // prozess, der keinen sendet. Alles mit Origin ist also fremd.
        // Der Header lässt sich aus einer Webseite heraus nicht fälschen.
        String origin = req.getHeader("Origin");
        if (origin != null) {
            System.out.println("[Auth] Browser-Zugriff abgewiesen: " + req.getMethod()
                + " " + path + " (Herkunft: " + origin + ")");
            res.setStatus(HttpServletResponse.SC_FORBIDDEN);
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"Zugriff aus dem Browser ist nicht erlaubt\"}");
            return;
        }

        if (!ApiToken.matches(req.getHeader(HEADER))) {
            System.out.println("[Auth] Abgewiesen: " + req.getMethod() + " " + path
                + " (Herkunft: " + String.valueOf(req.getHeader("Origin")) + ")");
            res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"Nicht autorisiert\"}");
            return;
        }

        chain.doFilter(request, response);
    }
}
