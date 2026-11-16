import { createContext } from 'react'

/**
 * True inside the view the phone keeps drawn, hidden and inert, beside the one on screen,
 * so a drag has something to reveal.
 *
 * That copy has to be as tall as it will be once it arrives, so it renders everything; but
 * its test ids would then be on the page twice, and anything that looks for "the door" or
 * "the import line" by id finds two and has to guess. Things that render there can drop
 * their ids and keep their shape.
 */
export const BesideContext = createContext(false)
