import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WhatGetsSent, EXAMPLE_ID } from './WhatGetsSent'

const fields = { version: '1.3.0', os: 'android', source: 'apk' }

/**
 * The row that writes the whole message out.
 *
 * It had no tests of its own: it was covered by the sheet it used to sit in, and that sheet
 * is gone. The guarantees are the same wherever it is shown, which is the argument for
 * testing it here rather than through whatever is around it.
 */
describe('what gets sent', () => {
  it('says nothing until it is opened', () => {
    render(<WhatGetsSent fields={fields} id="abc" />)

    expect(screen.queryByText('App version')).not.toBeInTheDocument()
  })

  /**
   * Five rows since 1.4.1, and the list **is** the message. Somebody reading this is being
   * told what leaves their device, so a field that travels and is not written here makes
   * the screen a lie rather than an omission.
   */
  it('writes out every line of the message, in the order it is sent', async () => {
    const user = userEvent.setup()
    render(<WhatGetsSent fields={fields} id="abc" />)

    await user.click(screen.getByRole('button'))

    expect(screen.getAllByRole('term').map((node) => node.textContent)).toEqual([
      'Random number',
      'App version',
      'System',
      'How it was installed',
      'Date',
    ])
  })

  it('shows the real values it was given', async () => {
    const user = userEvent.setup()
    render(<WhatGetsSent fields={fields} id="abc123" />)

    await user.click(screen.getByRole('button'))

    expect(screen.getByText('abc123')).toBeInTheDocument()
    expect(screen.getByText('1.3.0')).toBeInTheDocument()
    expect(screen.getByText('apk')).toBeInTheDocument()
  })

  // Before anybody has said yes there is no number, and inventing one would be showing a
  // thing that does not exist. The example is the same every time and belongs to nobody.
  it('shows an example rather than a number it does not have', async () => {
    const user = userEvent.setup()
    render(<WhatGetsSent fields={fields} id={null} />)

    await user.click(screen.getByRole('button'))

    expect(screen.getByText(EXAMPLE_ID)).toBeInTheDocument()
  })

  it('says where the number came from and what it is not', async () => {
    const user = userEvent.setup()
    render(<WhatGetsSent fields={fields} id="abc" />)

    await user.click(screen.getByRole('button'))

    expect(screen.getByText(/Made on this device, tied to nothing/)).toBeInTheDocument()
    expect(screen.getByText(/does not keep it/)).toBeInTheDocument()
  })
})
