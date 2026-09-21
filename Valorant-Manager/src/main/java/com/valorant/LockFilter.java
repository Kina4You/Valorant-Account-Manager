package com.valorant;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Riegelt alle Account-Zugriffe ab, solange das Master-Passwort nicht
 * eingegeben wurde. Durchgelassen wird nur, was zum Entsperren nötig ist.
 *
 * Ohne diesen Filter würde die App im gesperrten Zustand eine leere Liste
 * ausliefern — was wie "keine Accounts vorhanden" aussieht und zu falschen
 * Schlüssen führt.
 */
@Component
@Order(2) // nach dem TokenFilter
public class LockFilter implements Filter {

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest req = (HttpServletRequest) request;
        HttpServletResponse res = (HttpServletResponse) response;
        String path = req.getRequestURI();

        boolean needsUnlock = path.startsWith("/api/")
            && !path.startsWith("/api/security/")
            && !path.equals("/api/config/api-key/status");

        if (needsUnlock && StorageManager.globallyLocked()) {
            // 423 Locked — die Oberfläche erkennt daran, dass sie nach dem
            // Master-Passwort fragen muss.
            res.setStatus(423);
            res.setContentType("application/json");
            res.getWriter().write("{\"error\":\"Mit Master-Passwort gesperrt\"}");
            return;
        }
        chain.doFilter(request, response);
    }
}
