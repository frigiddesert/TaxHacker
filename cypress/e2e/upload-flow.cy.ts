describe('File Upload and Analysis Flow', () => {
  it('uploads file, analyzes with AI, and saves transaction', () => {
    cy.visit('/unsorted')
    cy.get('[data-upload-button]').attachFile('invoice.pdf', 'cypress/fixtures/invoice.pdf') // Assume fixture
    cy.get('[data-analyze-button]').click()
    cy.get('[data-testid="issuedAt"]').should('have.value', '2025-09-13') // Example assertion
    cy.get('[data-save-button]').click()
    cy.url().should('include', '/transactions')
  })
})