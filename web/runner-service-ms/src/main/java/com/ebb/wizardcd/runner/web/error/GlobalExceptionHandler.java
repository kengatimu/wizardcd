package com.ebb.wizardcd.runner.web.error;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Collections;
import java.util.NoSuchElementException;

@ControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // -----------------------------
    // Handle validation errors
    // -----------------------------
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ErrorResponse> handleValidationException(IllegalArgumentException ex) {
        log.warn("Validation error: {}", ex.getMessage());
        ErrorResponse response = new ErrorResponse(HttpStatus.BAD_REQUEST.value(), "VALIDATION_ERROR", ex.getMessage(), Collections.emptyList());
        return new ResponseEntity<>(response, HttpStatus.BAD_REQUEST);
    }

    // -----------------------------
    // Phase 5 — "no such row" → 404 (instead of falling through to the
    // generic 500 handler below). Service methods throw NoSuchElementException
    // when a UUID path parameter doesn't match a row; the REST API should
    // surface that as a clean 404.
    // -----------------------------
    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NoSuchElementException ex) {
        log.warn("Not found: {}", ex.getMessage());
        ErrorResponse response = new ErrorResponse(HttpStatus.NOT_FOUND.value(),
                "NOT_FOUND", ex.getMessage(), Collections.emptyList());
        return new ResponseEntity<>(response, HttpStatus.NOT_FOUND);
    }

    // -----------------------------
    // Phase 5 — ResponseStatusException carries its OWN status code. Honour
    // it explicitly so controllers can throw `new ResponseStatusException(
    // HttpStatus.BAD_REQUEST, "reason")` and have the status reach the wire.
    // Without this handler, Spring's catch-all below would clobber it to 500
    // in MockMvc tests.
    // -----------------------------
    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        HttpStatusCode status = ex.getStatusCode();
        String message = ex.getReason() != null ? ex.getReason() : "";
        if (status.is5xxServerError()) {
            log.error("Controller raised {}: {}", status.value(), message, ex);
        } else {
            log.warn("Controller raised {}: {}", status.value(), message);
        }
        ErrorResponse response = new ErrorResponse(status.value(),
                HttpStatus.valueOf(status.value()).getReasonPhrase().replace(' ', '_').toUpperCase(),
                message, Collections.emptyList());
        return new ResponseEntity<>(response, status);
    }

    // -----------------------------
    // Handle missing static resources (404)
    //
    // NoResourceFoundException is thrown by Spring when a request targets a
    // path that has no mapped controller and no static file (e.g. GET /,
    // GET /favicon.ico). These are expected for a REST-only API — browsers
    // auto-request favicon.ico on every page load. Suppress ERROR logging;
    // return a clean 404 instead.
    // -----------------------------
    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Void> handleNoResourceFound(NoResourceFoundException ex) {
        return ResponseEntity.notFound().build();
    }

    // -----------------------------
    // Handle generic errors
    // -----------------------------
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGenericException(Exception ex) {
        log.error("Unhandled exception occurred", ex);
        ErrorResponse response = new ErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR.value(), "INTERNAL_ERROR", "An unexpected error occurred", Collections.emptyList());
        return new ResponseEntity<>(response, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}