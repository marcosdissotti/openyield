describe('PDF drop', () => {
  it('shows extracted text after selecting a PDF', () => {
    cy.visit('/')
    cy.get('[data-cy=pdf-drop-area]').selectFile('cypress/fixtures/sample.pdf', {
      action: 'drag-drop',
    })
    cy.get('[data-cy=source-markdown-panel]', { timeout: 30000 }).should(
      'contain.text',
      'Hello Cypress Fixture',
    )
  })
})
